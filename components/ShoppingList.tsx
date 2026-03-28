'use client';

import { ShoppingItem } from '@/lib/types';

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

export default function ShoppingList({ items, onToggle, onUncheckAll }: Props) {
  const grouped: Record<string, ShoppingItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const sortedCats = [
    ...categoryOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c)),
  ];

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {checkedCount}/{items.length} items collected
        </p>
        {checkedCount > 0 && (
          <button
            onClick={onUncheckAll}
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
          style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }}
        />
      </div>

      {sortedCats.map((cat) => (
        <div key={cat} className="mb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {cat}
          </h3>
          <div className="space-y-1">
            {grouped[cat].map((item) => (
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
          </div>
        </div>
      ))}
    </div>
  );
}
