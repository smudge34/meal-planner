'use client';

import { useEffect } from 'react';
import { Meal } from '@/lib/types';

interface Props {
  meal: Meal | null;
  onClose: () => void;
}

const cuisineColors: Record<string, string> = {
  British: 'bg-blue-100 text-blue-800',
  Italian: 'bg-green-100 text-green-800',
  Asian: 'bg-red-100 text-red-800',
  Mexican: 'bg-orange-100 text-orange-800',
};

export default function RecipeModal({ meal, onClose }: Props) {
  useEffect(() => {
    if (!meal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [meal, onClose]);

  if (!meal) return null;

  const days = meal.leftoverDay
    ? `${meal.freshDay} (fresh) · ${meal.leftoverDay} (leftover)`
    : meal.freshDay;

  // Group ingredients by category
  const grouped: Record<string, typeof meal.recipe.ingredients> = {};
  for (const ing of meal.recipe.ingredients) {
    if (!grouped[ing.category]) grouped[ing.category] = [];
    grouped[ing.category].push(ing);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90dvh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cuisineColors[meal.cuisine]}`}>
                {meal.cuisine}
              </span>
              {meal.isVegetarian && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Vegetarian
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{meal.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{days}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex divide-x divide-gray-100 border-b border-gray-100 text-center">
          <div className="flex-1 py-3">
            <div className="text-lg font-bold text-gray-900">{meal.caloriesPerServing}</div>
            <div className="text-xs text-gray-500">kcal / serving</div>
          </div>
          <div className="flex-1 py-3">
            <div className="text-lg font-bold text-gray-900">{meal.servings}</div>
            <div className="text-xs text-gray-500">servings</div>
          </div>
          <div className="flex-1 py-3">
            <div className="text-lg font-bold text-gray-900">{meal.recipe.prepTime}</div>
            <div className="text-xs text-gray-500">min prep</div>
          </div>
          <div className="flex-1 py-3">
            <div className="text-lg font-bold text-gray-900">{meal.recipe.cookTime}</div>
            <div className="text-xs text-gray-500">min cook</div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {/* Description */}
          <p className="text-gray-600 text-sm leading-relaxed">{meal.description}</p>

          {/* Original recipe link */}
          {meal.recipeUrl && (
            <a
              href={meal.recipeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              View original recipe on {meal.recipeSite ?? 'external site'} →
            </a>
          )}

          {/* Ingredients */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-3">Ingredients</h3>
            <div className="space-y-4">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {cat}
                  </h4>
                  <ul className="space-y-1.5">
                    {items.map((ing, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{ing.name}</span>
                        <span className="text-gray-500 font-medium">
                          {ing.amount}{ing.unit ? ` ${ing.unit}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Instructions */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-3">Method</h3>
            <ol className="space-y-3">
              {meal.recipe.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-gray-700 leading-relaxed pt-0.5">{step.replace(/^Step \d+:\s*/i, '')}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
