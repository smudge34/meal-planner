'use client';

import { useState, useEffect } from 'react';
import { ShoppingItem } from '@/lib/types';
import {
  ManualItem,
  ManualStore,
  loadManualStore,
  addManualItem,
  toggleManualItem,
  deleteManualItem,
  clearExtras,
  uncheckAllManualItems,
} from '@/lib/db';
import { supabase } from '@/lib/supabase';

interface Props {
  items: ShoppingItem[];
  onToggle: (id: string) => void;
  onUncheckAll: () => void;
}

const categoryOrder = [
  'Fruit & Veg',
  'Meat & Fish',
  'Dairy & Eggs',
  'Pasta, Rice & Grains',
  'Tins & Jars',
  'Sauces & Condiments',
  'Frozen',
  'Bakery',
  'Other',
];

function genId() {
  return Math.random().toString(36).slice(2);
}

export default function ShoppingList({ items, onToggle, onUncheckAll }: Props) {
  const [store, setStore] = useState<ManualStore>({ byCategory: {}, extras: [] });
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [catInputs, setCatInputs] = useState<Record<string, string>>({});
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const [extrasInput, setExtrasInput] = useState('');

  // Load from Supabase on mount and subscribe to realtime changes
  useEffect(() => {
    loadManualStore().then(setStore);

    const sub = supabase
      .channel('shopping_extras_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_extras' },
        () => {
          // Reload the full store on any change (handles add/toggle/delete from other device)
          loadManualStore().then(setStore);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  // Group meal-plan items by category
  const grouped: Record<string, ShoppingItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  // All categories that have either meal-plan items or manual items
  const allCatKeys = new Set([
    ...Object.keys(grouped),
    ...Object.keys(store.byCategory).filter((c) => store.byCategory[c].length > 0),
  ]);
  const sortedCats = [
    ...categoryOrder.filter((c) => allCatKeys.has(c)),
    ...[...allCatKeys].filter((c) => !categoryOrder.includes(c)),
  ];

  // Totals including manual items
  const allManualCat = Object.values(store.byCategory).flat();
  const checkedCount =
    items.filter((i) => i.checked).length +
    allManualCat.filter((i) => i.checked).length +
    store.extras.filter((i) => i.checked).length;
  const totalCount = items.length + allManualCat.length + store.extras.length;

  function handleUncheckAll() {
    onUncheckAll(); // unchecks AI shopping items via page.tsx
    uncheckAllManualItems(); // fire-and-forget, realtime will sync
    // Optimistic local update
    setStore((prev) => ({
      byCategory: Object.fromEntries(
        Object.entries(prev.byCategory).map(([cat, catItems]) => [
          cat,
          catItems.map((i) => ({ ...i, checked: false })),
        ]),
      ),
      extras: prev.extras.map((i) => ({ ...i, checked: false })),
    }));
  }

  // Per-category actions
  function addToCat(cat: string) {
    const name = (catInputs[cat] ?? '').trim();
    if (!name) return;
    const id = genId();
    // Optimistic local update
    setStore((prev) => ({
      ...prev,
      byCategory: {
        ...prev.byCategory,
        [cat]: [...(prev.byCategory[cat] ?? []), { id, name, checked: false }],
      },
    }));
    setCatInputs((prev) => ({ ...prev, [cat]: '' }));
    setExpandedCat(null);
    addManualItem(id, cat, name); // fire-and-forget
  }

  function toggleCatManual(cat: string, item: ManualItem) {
    const newChecked = !item.checked;
    // Optimistic local update
    setStore((prev) => ({
      ...prev,
      byCategory: {
        ...prev.byCategory,
        [cat]: prev.byCategory[cat].map((i) =>
          i.id === item.id ? { ...i, checked: newChecked } : i,
        ),
      },
    }));
    toggleManualItem(item.id, newChecked); // fire-and-forget
  }

  function deleteCatManual(cat: string, id: string) {
    // Optimistic local update
    setStore((prev) => ({
      ...prev,
      byCategory: {
        ...prev.byCategory,
        [cat]: prev.byCategory[cat].filter((i) => i.id !== id),
      },
    }));
    deleteManualItem(id); // fire-and-forget
  }

  // Extras actions
  function addExtra() {
    const name = extrasInput.trim();
    if (!name) return;
    const id = genId();
    // Optimistic local update
    setStore((prev) => ({
      ...prev,
      extras: [...prev.extras, { id, name, checked: false }],
    }));
    setExtrasInput('');
    setExtrasExpanded(false);
    addManualItem(id, null, name); // fire-and-forget
  }

  function toggleExtra(item: ManualItem) {
    const newChecked = !item.checked;
    // Optimistic local update
    setStore((prev) => ({
      ...prev,
      extras: prev.extras.map((i) => (i.id === item.id ? { ...i, checked: newChecked } : i)),
    }));
    toggleManualItem(item.id, newChecked); // fire-and-forget
  }

  function deleteExtra(id: string) {
    // Optimistic local update
    setStore((prev) => ({ ...prev, extras: prev.extras.filter((i) => i.id !== id) }));
    deleteManualItem(id); // fire-and-forget
  }

  function handleClearExtras() {
    setStore((prev) => ({ ...prev, extras: [] }));
    clearExtras(); // fire-and-forget
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {checkedCount}/{totalCount} items collected
        </p>
        {checkedCount > 0 && (
          <button
            onClick={handleUncheckAll}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Uncheck all
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-300"
          style={{ width: `${totalCount ? (checkedCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      {sortedCats.map((cat) => {
        const catManual = store.byCategory[cat] ?? [];
        const isExpanded = expandedCat === cat;

        return (
          <div key={cat} className="mb-5">
            {/* Category heading with + button */}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">
                {cat}
              </h3>
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat)}
                className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center text-xs leading-none transition-colors"
                aria-label={`Add item to ${cat}`}
              >
                +
              </button>
            </div>

            {/* Inline add input */}
            {isExpanded && (
              <div className="flex gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={catInputs[cat] ?? ''}
                  onChange={(e) => setCatInputs((prev) => ({ ...prev, [cat]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addToCat(cat);
                    if (e.key === 'Escape') setExpandedCat(null);
                  }}
                  placeholder="Add item…"
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-emerald-400 bg-white"
                />
                <button
                  onClick={() => addToCat(cat)}
                  className="px-3 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  Add
                </button>
              </div>
            )}

            <div className="space-y-1">
              {/* Meal-plan items */}
              {(grouped[cat] ?? []).map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    item.checked ? 'bg-gray-50' : 'bg-white border border-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => onToggle(item.id)}
                    className="w-5 h-5 rounded-md accent-emerald-500 cursor-pointer"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      item.checked ? 'line-through text-gray-400' : 'text-gray-700'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="text-sm text-gray-400 font-medium flex-shrink-0">
                    {item.amount}{item.unit ? ` ${item.unit}` : ''}
                  </span>
                </label>
              ))}

              {/* Manually added items in this category */}
              {catManual.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    item.checked ? 'bg-gray-50' : 'bg-white border border-indigo-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleCatManual(cat, item)}
                    className="w-5 h-5 rounded-md accent-emerald-500 cursor-pointer"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      item.checked ? 'line-through text-gray-400' : 'text-indigo-500'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="text-xs text-indigo-300 flex-shrink-0 mr-1" aria-hidden>+</span>
                  <button
                    onClick={() => deleteCatManual(cat, item.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors w-5 h-5 flex items-center justify-center flex-shrink-0"
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* My Extras section */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">
            My Extras
          </h3>
          {store.extras.length > 0 && (
            <button
              onClick={handleClearExtras}
              className="text-xs text-gray-300 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setExtrasExpanded(!extrasExpanded)}
            className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center text-xs leading-none transition-colors"
            aria-label="Add extra item"
          >
            +
          </button>
        </div>

        {extrasExpanded && (
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              type="text"
              value={extrasInput}
              onChange={(e) => setExtrasInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addExtra();
                if (e.key === 'Escape') setExtrasExpanded(false);
              }}
              placeholder="Add extra item…"
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-emerald-400 bg-white"
            />
            <button
              onClick={addExtra}
              className="px-3 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Add
            </button>
          </div>
        )}

        {store.extras.length === 0 && !extrasExpanded && (
          <p className="text-xs text-gray-300 py-1">
            Anything that doesn&apos;t fit a category above.
          </p>
        )}

        <div className="space-y-1">
          {store.extras.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                item.checked ? 'bg-gray-50' : 'bg-white border border-indigo-100'
              }`}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleExtra(item)}
                className="w-5 h-5 rounded-md accent-emerald-500 cursor-pointer"
              />
              <span
                className={`flex-1 text-sm ${
                  item.checked ? 'line-through text-gray-400' : 'text-indigo-500'
                }`}
              >
                {item.name}
              </span>
              <span className="text-xs text-indigo-300 flex-shrink-0 mr-1" aria-hidden>+</span>
              <button
                onClick={() => deleteExtra(item.id)}
                className="text-gray-300 hover:text-red-400 transition-colors w-5 h-5 flex items-center justify-center flex-shrink-0"
                aria-label={`Remove ${item.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
