import { supabase } from './supabase';
import { AppState, Week } from './types';

export interface ManualItem {
  id: string;
  name: string;
  checked: boolean;
}

export interface ManualStore {
  byCategory: Record<string, ManualItem[]>;
  extras: ManualItem[];
}

export async function loadAppState(): Promise<AppState> {
  const [planResult, historyResult, checksResult] = await Promise.all([
    supabase.from('meal_plan').select('*').eq('id', 'current').single(),
    supabase.from('meal_history').select('*').order('week_number', { ascending: false }),
    supabase.from('shopping_checks').select('item_id, checked'),
  ]);

  const checksMap: Record<string, boolean> = {};
  for (const c of checksResult.data ?? []) {
    checksMap[c.item_id] = c.checked;
  }

  let currentWeek: Week | null = null;
  if (planResult.data?.week_data) {
    const week = planResult.data.week_data as Week;
    currentWeek = {
      ...week,
      shoppingList: week.shoppingList.map((item) => ({
        ...item,
        checked: checksMap[item.id] ?? false,
      })),
    };
  }

  const history: Week[] = (historyResult.data ?? []).map((row) => row.week_data as Week);

  return {
    currentWeek,
    history,
    cuisineRotationIndex: planResult.data?.cuisine_rotation_index ?? 0,
  };
}

export async function saveMealPlan(week: Week, cuisineRotationIndex: number): Promise<void> {
  // Store the week without checked states — those live in shopping_checks
  const weekData = {
    ...week,
    shoppingList: week.shoppingList.map((item) => ({ ...item, checked: false })),
  };
  await supabase.from('meal_plan').upsert({
    id: 'current',
    cuisine_rotation_index: cuisineRotationIndex,
    week_data: weekData,
    updated_at: new Date().toISOString(),
  });
}

export async function archiveWeekToHistory(week: Week): Promise<void> {
  await supabase.from('meal_history').upsert({
    id: week.id,
    week_number: week.weekNumber,
    generated_at: week.generatedAt,
    week_data: week,
  });
}

/** Set one item's checked state. Uses upsert so INSERT and UPDATE both work. */
export async function upsertShoppingCheck(itemId: string, checked: boolean): Promise<void> {
  await supabase.from('shopping_checks').upsert({
    item_id: itemId,
    checked,
    updated_at: new Date().toISOString(),
  });
}

/** Set all checked rows to false (for "Uncheck all"). */
export async function uncheckAllShoppingItems(): Promise<void> {
  await supabase
    .from('shopping_checks')
    .update({ checked: false, updated_at: new Date().toISOString() })
    .eq('checked', true);
}

/** Remove all check states — used when a new/refreshed plan replaces the shopping list. */
export async function clearShoppingChecks(): Promise<void> {
  // Delete via a filter that matches every row
  await supabase.from('shopping_checks').delete().gte('updated_at', '1970-01-01');
}

// ── Manual items (shopping_extras) ──────────────────────────────────────────

export async function loadManualStore(): Promise<ManualStore> {
  const { data } = await supabase
    .from('shopping_extras')
    .select('*')
    .order('created_at', { ascending: true });

  const byCategory: Record<string, ManualItem[]> = {};
  const extras: ManualItem[] = [];

  for (const row of data ?? []) {
    const item: ManualItem = { id: row.id, name: row.name, checked: row.checked };
    if (row.category === null || row.category === undefined) {
      extras.push(item);
    } else {
      if (!byCategory[row.category]) byCategory[row.category] = [];
      byCategory[row.category].push(item);
    }
  }

  return { byCategory, extras };
}

export async function addManualItem(
  id: string,
  category: string | null,
  name: string,
): Promise<void> {
  await supabase.from('shopping_extras').insert({ id, category, name, checked: false });
}

export async function toggleManualItem(id: string, checked: boolean): Promise<void> {
  await supabase.from('shopping_extras').update({ checked }).eq('id', id);
}

export async function deleteManualItem(id: string): Promise<void> {
  await supabase.from('shopping_extras').delete().eq('id', id);
}

export async function clearExtras(): Promise<void> {
  await supabase.from('shopping_extras').delete().is('category', null);
}

export async function uncheckAllManualItems(): Promise<void> {
  await supabase.from('shopping_extras').update({ checked: false }).eq('checked', true);
}
