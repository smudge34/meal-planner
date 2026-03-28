'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Week, Meal, MealSlot, ShoppingItem, MEAL_SLOTS } from '@/lib/types';
import {
  loadAppState,
  saveMealPlan,
  archiveWeekToHistory,
  upsertShoppingCheck,
  uncheckAllShoppingItems,
  clearShoppingChecks,
} from '@/lib/db';
import { supabase } from '@/lib/supabase';
import MealCard from '@/components/MealCard';
import RecipeModal from '@/components/RecipeModal';
import ShoppingList from '@/components/ShoppingList';
import GenerateButton from '@/components/GenerateButton';

type Tab = 'meals' | 'shopping' | 'history';

// Week starts Sunday
const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildSchedule(meals: Meal[]) {
  const schedule: { day: string; meal: Meal; isLeftover: boolean }[] = [];
  for (const meal of meals) {
    // Use MEAL_SLOTS as the canonical source of truth for day names.
    // The AI sometimes swaps freshDay/leftoverDay, so we never trust those fields.
    const slotDef = MEAL_SLOTS.find((s) => s.slot === meal.slot);
    const freshDay = slotDef?.freshDay ?? meal.freshDay;
    const leftoverDay = slotDef ? slotDef.leftoverDay : meal.leftoverDay;
    schedule.push({ day: freshDay, meal, isLeftover: false });
    if (leftoverDay) schedule.push({ day: leftoverDay, meal, isLeftover: true });
  }
  return schedule.sort((a, b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day));
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

export default function Home() {
  const [state, setState] = useState<AppState>({
    currentWeek: null,
    history: [],
    cuisineRotationIndex: 0,
  });
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>('meals');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [streamProgress, setStreamProgress] = useState(0);
  const [refreshingSlot, setRefreshingSlot] = useState<MealSlot | null>(null);

  // Refs to guard against stale closures in realtime callbacks
  const loadingRef = useRef(false);
  const refreshingSlotRef = useRef<MealSlot | null>(null);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { refreshingSlotRef.current = refreshingSlot; }, [refreshingSlot]);

  // Load from Supabase on mount
  useEffect(() => {
    loadAppState().then((appState) => {
      setState(appState);
      setHydrated(true);
    });
  }, []);

  // Real-time subscriptions (active once hydrated)
  useEffect(() => {
    if (!hydrated) return;

    // Shopping item check states — apply each update individually
    const checksSub = supabase
      .channel('shopping_checks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_checks' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const { item_id, checked } = payload.new as { item_id: string; checked: boolean };
            setState((prev) => {
              if (!prev.currentWeek) return prev;
              return {
                ...prev,
                currentWeek: {
                  ...prev.currentWeek,
                  shoppingList: prev.currentWeek.shoppingList.map((item) =>
                    item.id === item_id ? { ...item, checked } : item,
                  ),
                },
              };
            });
          }
        },
      )
      .subscribe();

    // Meal plan updates (new plan generated or meal refreshed on the other device)
    const planSub = supabase
      .channel('meal_plan_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meal_plan' },
        () => {
          // Skip if this device is currently generating/refreshing (it will set its own state)
          if (!loadingRef.current && refreshingSlotRef.current === null) {
            loadAppState().then(setState);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(checksSub);
      supabase.removeChannel(planSub);
    };
  }, [hydrated]);

  const generateWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamProgress(0);

    // Capture current values before the async operation
    const prevWeek = state.currentWeek;
    const prevCuisineIndex = state.cuisineRotationIndex;
    const prevHistory = state.history;

    try {
      const res = await fetch('/api/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: prevHistory,
          cuisineRotationIndex: prevCuisineIndex,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let recipeUrls: Record<string, { url: string; site: string }> = {};

      const ESTIMATED_TOTAL = 6000;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.error) throw new Error(payload.error);

          if (payload.chunk) {
            fullText += payload.chunk;
            setStreamProgress(Math.min(90, (fullText.length / ESTIMATED_TOTAL) * 100));
          }

          if (payload.status === 'searching') {
            setStreamProgress(95);
          }

          if (payload.done) {
            fullText = payload.fullText;
            recipeUrls = payload.recipeUrls ?? {};
            setStreamProgress(100);
          }
        }
      }

      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not parse response from AI');
      const parsed = JSON.parse(jsonMatch[0]);

      const meals: Meal[] = parsed.meals.map((m: Partial<Meal> & { name: string }) => ({
        ...m,
        id: generateId(),
        recipeUrl: recipeUrls[m.name]?.url ?? null,
        recipeSite: recipeUrls[m.name]?.site ?? null,
      }));

      const shoppingList: ShoppingItem[] = parsed.shoppingList.map(
        (item: Omit<ShoppingItem, 'id' | 'checked'>) => ({
          ...item,
          id: generateId(),
          checked: false,
        }),
      );

      const newCuisineIndex = (prevCuisineIndex + 1) % 4;

      const newWeek: Week = {
        id: generateId(),
        weekNumber: prevHistory.length + 1,
        generatedAt: new Date().toISOString(),
        meals,
        shoppingList,
        estimatedCost: parsed.estimatedCost ?? '£35–£45',
        cuisineRotationIndex: prevCuisineIndex,
      };

      // Persist to Supabase
      if (prevWeek) await archiveWeekToHistory(prevWeek);
      await clearShoppingChecks(); // fresh plan = fresh ticks
      await saveMealPlan(newWeek, newCuisineIndex);

      setState((prev) => ({
        currentWeek: newWeek,
        history: prev.currentWeek
          ? [{ ...prev.currentWeek }, ...prev.history]
          : prev.history,
        cuisineRotationIndex: newCuisineIndex,
      }));

      setTab('meals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
      setStreamProgress(0);
    }
  }, [state.history, state.cuisineRotationIndex, state.currentWeek]);

  const refreshMeal = useCallback(
    async (slot: MealSlot) => {
      if (!state.currentWeek) return;
      setRefreshingSlot(slot);
      setError(null);

      try {
        const res = await fetch('/api/refresh-meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slot,
            currentMeals: state.currentWeek.meals,
            history: state.history,
            cuisineRotationIndex: state.currentWeek.cuisineRotationIndex,
          }),
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const { meal, shoppingList } = await res.json();

        const updatedWeek: Week = {
          ...state.currentWeek,
          meals: state.currentWeek.meals.map((m) => (m.slot === slot ? meal : m)),
          shoppingList,
        };

        // Shopping list IDs change on refresh, so clear all check states
        await clearShoppingChecks();
        await saveMealPlan(updatedWeek, state.cuisineRotationIndex);

        setState((prev) => {
          if (!prev.currentWeek) return prev;
          return {
            ...prev,
            currentWeek: {
              ...prev.currentWeek,
              meals: prev.currentWeek.meals.map((m) => (m.slot === slot ? meal : m)),
              shoppingList,
            },
          };
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh meal');
      } finally {
        setRefreshingSlot(null);
      }
    },
    [state.currentWeek, state.history, state.cuisineRotationIndex],
  );

  const toggleItem = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.currentWeek) return prev;
      const item = prev.currentWeek.shoppingList.find((i) => i.id === id);
      const newChecked = item ? !item.checked : false;
      upsertShoppingCheck(id, newChecked); // fire-and-forget, realtime will sync the other device
      return {
        ...prev,
        currentWeek: {
          ...prev.currentWeek,
          shoppingList: prev.currentWeek.shoppingList.map((i) =>
            i.id === id ? { ...i, checked: newChecked } : i,
          ),
        },
      };
    });
  }, []);

  const uncheckAll = useCallback(() => {
    uncheckAllShoppingItems(); // fire-and-forget
    setState((prev) => {
      if (!prev.currentWeek) return prev;
      return {
        ...prev,
        currentWeek: {
          ...prev.currentWeek,
          shoppingList: prev.currentWeek.shoppingList.map((item) => ({
            ...item,
            checked: false,
          })),
        },
      };
    });
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  const week = state.currentWeek;

  return (
    <>
      <RecipeModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Meal Planner</h1>
              {week && (
                <p className="text-xs text-gray-400">
                  Week {week.weekNumber} · {week.estimatedCost}
                </p>
              )}
            </div>
            {week && (
              <nav className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                {(['meals', 'shopping', 'history'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      tab === t
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'shopping' ? 'Shop' : t === 'history' ? 'History' : 'Meals'}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <GenerateButton
            onGenerate={generateWeek}
            loading={loading}
            hasWeek={!!week}
            streamProgress={streamProgress}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!week && !loading && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🍽</div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">No plan yet</h2>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                Hit the button above to AI-generate your first week of dinners.
              </p>
            </div>
          )}

          {week && tab === 'meals' && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                This Week&apos;s Dinners
              </h2>
              {!week.meals.some((m) => m.isVegetarian) && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
                  No vegetarian meal this week — generate a new plan to include one.
                </div>
              )}
              {buildSchedule(week.meals).map(({ day, meal, isLeftover }, index) => (
                <MealCard
                  key={`${day}-${index}`}
                  meal={meal}
                  day={day}
                  isLeftover={isLeftover}
                  isRefreshing={refreshingSlot === meal.slot}
                  onOpen={setSelectedMeal}
                  onRefresh={!isLeftover ? () => refreshMeal(meal.slot as MealSlot) : undefined}
                />
              ))}
            </section>
          )}

          {week && tab === 'shopping' && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Shopping List
              </h2>
              <ShoppingList
                items={week.shoppingList}
                onToggle={toggleItem}
                onUncheckAll={uncheckAll}
              />
            </section>
          )}

          {tab === 'history' && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Past Weeks
              </h2>
              {state.history.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No history yet — previous weeks will appear here.
                </p>
              ) : (
                state.history.map((w) => (
                  <div key={w.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">
                        Week {w.weekNumber}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(w.generatedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {w.meals.sort((a, b) => a.slot - b.slot).map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="text-gray-300">·</span>
                          <span>{m.name}</span>
                          <span className="text-xs text-gray-400 ml-auto">{m.cuisine}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          )}
        </main>
      </div>
    </>
  );
}
