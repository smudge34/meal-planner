import { Cuisine, CUISINES, MEAL_SLOTS, Meal, Week } from './types';

const COUPLE_PROFILE = `HOUSEHOLD PROFILE:
• Adventurous eaters — global cuisines, interesting techniques, less common ingredients all welcome (e.g. shakshuka, bibimbap, tagines, pho, mole, dal, gnocchi, khao soi, berbere, harissa, jerk, rendang)
• Spice tolerance: medium to hot
• Eat meat, fish and seafood freely
• Kitchen equipment: conventional oven, hob, air fryer, slow cooker — suggest recipes that make good use of these
• STRICT NUT ALLERGY: absolutely no nuts of any kind (peanuts, almonds, cashews, walnuts, pine nuts, pistachios, hazelnuts, etc.)
• No offal (liver, kidney, heart, tripe)
• All ingredients available at Aldi UK
• Target weekly grocery cost: £35–£45`;

const SHOPPING_RULES = `shoppingList must be a consolidated, deduplicated list across all 4 meals with quantities combined where the same ingredient appears in multiple meals. Categories: "Meat & Fish", "Dairy & Eggs", "Fruit & Veg", "Tins & Jars", "Pasta, Rice & Grains", "Sauces & Condiments", "Frozen", "Bakery", "Other".`;

/** Returns the slot index (0-3) that must be vegetarian for this rotation */
export function vegetarianSlotFor(cuisineRotationIndex: number): number {
  return cuisineRotationIndex % 4;
}

export function buildPrompt(history: Week[], cuisineRotationIndex: number): string {
  const pastMealNames = history
    .flatMap((w) => w.meals.map((m) => m.name))
    .join(', ');

  const vegSlot = vegetarianSlotFor(cuisineRotationIndex);

  const slotCuisines: Cuisine[] = MEAL_SLOTS.map(
    (_, i) => CUISINES[(cuisineRotationIndex + i) % 4],
  );

  const mealSpecs = MEAL_SLOTS.map((slotDef, i) => {
    const cuisine = slotCuisines[i];
    const isVeg = slotDef.slot === vegSlot;
    const vegNote = isVeg ? ' — MUST be vegetarian (no meat, no fish)' : '';
    const days = slotDef.leftoverDay
      ? `${slotDef.freshDay} (fresh) + ${slotDef.leftoverDay} (leftover)`
      : slotDef.freshDay;
    const cookNote =
      slotDef.cookTime === 'quick'
        ? 'weeknight-friendly (under 60 min total)'
        : 'long cook welcome (slow cooker, air fryer, oven roast etc)';
    return `  Slot ${slotDef.slot}: ${cuisine} cuisine${vegNote} · serves ${slotDef.servings} · ${days} · ${cookNote}`;
  }).join('\n');

  const ex = MEAL_SLOTS[0];
  const exCuisine = slotCuisines[0];
  const exIsVeg = ex.slot === vegSlot;

  const vegSlotDef = MEAL_SLOTS[vegSlot];

  return `You are a meal planning assistant for a food-loving couple.

${COUPLE_PROFILE}

MEAL PLAN — 4 meals covering 7 nights:
${mealSpecs}

⚠️ MANDATORY — EXACTLY ONE VEGETARIAN MEAL:
Slot ${vegSlot} (${vegSlotDef.freshDay}) MUST be 100% vegetarian — no meat, no fish, no seafood of any kind.
Set "isVegetarian": true for slot ${vegSlot} and "isVegetarian": false for every other slot.
The response is invalid if slot ${vegSlot} contains any meat, fish, or seafood,
or if "isVegetarian" is not explicitly true for slot ${vegSlot}.

DO NOT repeat any of these previous meals: ${pastMealNames || 'none yet'}

OUTPUT: valid JSON only, no markdown, no extra text:

{
  "estimatedCost": "£XX–£XX",
  "meals": [
    {
      "slot": ${ex.slot},
      "name": "Dish Name",
      "cuisine": "${exCuisine}",
      "servings": ${ex.servings},
      "isVegetarian": ${exIsVeg},
      "freshDay": "${ex.freshDay}",
      "leftoverDay": ${ex.leftoverDay ? `"${ex.leftoverDay}"` : 'null'},
      "description": "2-3 sentence description of the dish — what it is, key flavours, and why it's worth making.",
      "caloriesPerServing": 550,
      "recipe": {
        "prepTime": 15,
        "cookTime": 120,
        "ingredients": [
          { "name": "chicken thighs", "amount": "600", "unit": "g", "category": "Meat & Fish" }
        ]
      }
    }
  ],
  "shoppingList": [
    { "name": "chicken thighs", "amount": "600", "unit": "g", "category": "Meat & Fish" }
  ]
}

Rules:
• slot values must be integers 0–3
• isVegetarian MUST be true for slot ${vegSlot} (${vegSlotDef.freshDay}) and false for all others
• servings: slots 0,1,2 → 4; slot 3 → 2
• freshDay / leftoverDay must exactly match the days in the meal plan above
• ${SHOPPING_RULES}`;
}

export function buildRefreshMealPrompt(
  slot: number,
  allMeals: Meal[],
  history: Week[],
  cuisineRotationIndex: number,
): string {
  const slotDef = MEAL_SLOTS[slot];
  const cuisine = CUISINES[(cuisineRotationIndex + slot) % 4];
  const vegSlot = vegetarianSlotFor(cuisineRotationIndex);
  const isVeg = slot === vegSlot;

  const avoidNames = [
    ...history.flatMap((w) => w.meals.map((m) => m.name)),
    ...allMeals.filter((m) => m.slot !== slot).map((m) => m.name),
  ].join(', ');

  const otherMeals = allMeals.filter((m) => m.slot !== slot);
  const otherMealsText = otherMeals
    .map(
      (m) =>
        `${m.name} (serves ${m.servings}):\n` +
        m.recipe.ingredients
          .map((i) => `  ${i.amount}${i.unit ? ' ' + i.unit : ''} ${i.name}`)
          .join('\n'),
    )
    .join('\n\n');

  const days = slotDef.leftoverDay
    ? `${slotDef.freshDay} (fresh) + ${slotDef.leftoverDay} (leftover)`
    : slotDef.freshDay;
  const cookNote =
    slotDef.cookTime === 'quick'
      ? 'weeknight-friendly (under 60 min total)'
      : 'long cook welcome (slow cooker, air fryer, oven roast etc)';
  const vegNote = isVeg
    ? '\n⚠️ THIS MEAL MUST BE 100% VEGETARIAN — no meat, no fish, no seafood. Set "isVegetarian": true.'
    : '';

  return `Regenerate ONE meal for a weekly dinner plan and return an updated full shopping list.

${COUPLE_PROFILE}

MEAL TO REPLACE — Slot ${slot}:
• Cuisine: ${cuisine}${vegNote}
• Serves: ${slotDef.servings}
• Days: ${days}
• Cook style: ${cookNote}
• Do NOT use any of these meals: ${avoidNames || 'none'}

OTHER MEALS STAYING IN THE PLAN (needed for the shopping list):
${otherMealsText || 'none'}

Return ONLY valid JSON (no markdown):
{
  "meal": {
    "slot": ${slot},
    "name": "Dish Name",
    "cuisine": "${cuisine}",
    "servings": ${slotDef.servings},
    "isVegetarian": ${isVeg},
    "freshDay": "${slotDef.freshDay}",
    "leftoverDay": ${slotDef.leftoverDay ? `"${slotDef.leftoverDay}"` : 'null'},
    "description": "2-3 sentence description of the dish — what it is, key flavours, and why it's worth making.",
    "caloriesPerServing": 550,
    "recipe": {
      "prepTime": 15,
      "cookTime": 60,
      "ingredients": [
        { "name": "ingredient", "amount": "100", "unit": "g", "category": "Meat & Fish" }
      ]
    }
  },
  "shoppingList": [
    { "name": "ingredient", "amount": "...", "unit": "...", "category": "..." }
  ]
}

The shoppingList must consolidate and deduplicate ALL 4 meals' ingredients (the 3 existing meals above plus the new meal). ${SHOPPING_RULES}`;
}
