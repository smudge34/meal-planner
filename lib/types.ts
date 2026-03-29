export type Cuisine = 'British' | 'Italian' | 'Asian' | 'Mexican';

export type MealSlot = 0 | 1 | 2 | 3;

export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
  category: string;
}

export interface Recipe {
  ingredients: Ingredient[];
  instructions?: string[];
  prepTime: number;
  cookTime: number;
}

export interface Meal {
  id: string;
  slot: MealSlot;
  name: string;
  cuisine: Cuisine;
  servings: number;
  isVegetarian: boolean;
  freshDay: string;
  leftoverDay: string | null;
  recipe: Recipe;
  caloriesPerServing: number;
  description: string;
  recipeUrl?: string | null;
  recipeSite?: string | null;
}

export interface ShoppingItem {
  id: string;
  name: string;
  amount: string;
  unit: string;
  category: string;
  checked: boolean;
}

export interface Week {
  id: string;
  weekNumber: number;
  generatedAt: string;
  meals: Meal[];
  shoppingList: ShoppingItem[];
  estimatedCost: string;
  cuisineRotationIndex: number; // index used when this week was generated
  removedSlots?: MealSlot[];    // entire slot removed (ingredients removed from shopping list)
  hiddenLeftovers?: MealSlot[]; // just the leftover day hidden, meal + ingredients remain
}

export interface AppState {
  currentWeek: Week | null;
  history: Week[];
  cuisineRotationIndex: number;
}

// Week starts on Sunday. cookTime: 'long' = slow cooker/roast welcome, 'quick' = under 60 min
export const MEAL_SLOTS = [
  { slot: 0, freshDay: 'Sunday',   leftoverDay: 'Monday',    servings: 4, cookTime: 'long'  },
  { slot: 1, freshDay: 'Tuesday',  leftoverDay: 'Wednesday', servings: 4, cookTime: 'quick' },
  { slot: 2, freshDay: 'Thursday', leftoverDay: 'Friday',    servings: 4, cookTime: 'quick' },
  { slot: 3, freshDay: 'Saturday', leftoverDay: null,         servings: 2, cookTime: 'long'  },
] as const;

export const CUISINES: Cuisine[] = ['British', 'Italian', 'Asian', 'Mexican'];
