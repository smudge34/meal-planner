'use client';

import { Meal } from '@/lib/types';

interface Props {
  meal: Meal;
  onOpen: (meal: Meal) => void;
  day?: string;
  isLeftover?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const cuisineColors: Record<string, string> = {
  British: 'bg-blue-100 text-blue-800',
  Italian: 'bg-green-100 text-green-800',
  Asian: 'bg-red-100 text-red-800',
  Mexican: 'bg-orange-100 text-orange-800',
};

export default function MealCard({
  meal,
  onOpen,
  day,
  isLeftover,
  onRefresh,
  isRefreshing,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const mealDisplayName = meal.name;

  return (
    <div
      className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 transition-all ${
        isRefreshing
          ? 'opacity-60 pointer-events-none'
          : 'hover:shadow-md hover:border-gray-200 cursor-pointer active:scale-[0.99]'
      }`}
      onClick={() => !isRefreshing && onOpen(meal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !isRefreshing && onOpen(meal)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {day && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {isLeftover ? `${day} (Leftovers)` : day}
              </span>
              {!isLeftover && (onMoveUp !== undefined || onMoveDown !== undefined) && (
                <span className="flex gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                    disabled={!onMoveUp || isRefreshing}
                    title="Move earlier in the week"
                    className="text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-20 disabled:cursor-default"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                    disabled={!onMoveDown || isRefreshing}
                    title="Move later in the week"
                    className="text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-20 disabled:cursor-default"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </span>
              )}
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  disabled={isRefreshing}
                  title="Remove this day"
                  className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <h3 className="font-semibold text-gray-900 text-base leading-snug">
            {isRefreshing ? 'Finding a new recipe…' : mealDisplayName}
          </h3>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cuisineColors[meal.cuisine]}`}
          >
            {meal.cuisine}
          </span>
          {meal.isVegetarian && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Veggie
            </span>
          )}
        </div>
      </div>

      {isLeftover ? (
        <p className="text-sm text-gray-400 italic">Leftovers — tap to view recipe</p>
      ) : (
        <>
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{meal.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>🍽 {meal.servings} servings</span>
            <span>🔥 {meal.caloriesPerServing} kcal/serving</span>
            <span>⏱ {meal.recipe.prepTime + meal.recipe.cookTime} min</span>
          </div>
        </>
      )}

      {/* Refresh button — only on fresh-day cards */}
      {!isLeftover && onRefresh && (
        <div className="mt-3 pt-3 border-t border-gray-50 flex justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            {isRefreshing ? (
              <>
                <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Refreshing…
              </>
            ) : (
              <>↺ Refresh this meal</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
