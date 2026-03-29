import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { buildRefreshMealPrompt } from '@/lib/prompt';
import { Meal, MealSlot, ShoppingItem, Week } from '@/lib/types';
import { findRecipeUrls } from '@/lib/ai';

export const maxDuration = 120;

function generateId() {
  return Math.random().toString(36).slice(2);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slot: MealSlot = body.slot;

  console.log(`[refresh-meal] request received — slot=${slot}, planned: 2 API calls (1 meal+shopping + 1 recipe search)`);

  try {
    const currentMeals: Meal[] = body.currentMeals ?? [];
    const history: Week[] = body.history ?? [];
    const cuisineRotationIndex: number = body.cuisineRotationIndex ?? 0;

    const prompt = buildRefreshMealPrompt(slot, currentMeals, history, cuisineRotationIndex);
    const client = new Anthropic();

    // API call 1: Generate the replacement meal + updated shopping list
    console.log(`[refresh-meal] API call 1/2 — generating replacement meal for slot ${slot}`);
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    console.log(
      `[refresh-meal] API call 1 complete — ` +
      `input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // API call 2: Find recipe URL via web search (max 1 search for this 1 meal)
    console.log(`[refresh-meal] API call 2/2 — recipe URL search for "${parsed.meal.name}"`);
    let recipeUrl: string | null = null;
    let recipeSite: string | null = null;
    try {
      const urls = await findRecipeUrls(client, [parsed.meal.name]);
      recipeUrl = urls[parsed.meal.name]?.url ?? null;
      recipeSite = urls[parsed.meal.name]?.site ?? null;
    } catch (searchErr) {
      console.log(`[refresh-meal] recipe search failed (non-fatal): ${searchErr instanceof Error ? searchErr.message : String(searchErr)}`);
    }

    console.log(
      `[refresh-meal] complete — slot=${slot} meal="${parsed.meal.name}" ` +
      `recipeUrl=${recipeUrl ?? 'none'} total API calls: 2`,
    );

    const meal: Meal = {
      ...parsed.meal,
      id: generateId(),
      recipeUrl,
      recipeSite,
    };

    const shoppingList: ShoppingItem[] = (parsed.shoppingList ?? []).map(
      (item: Omit<ShoppingItem, 'id' | 'checked'>) => ({
        ...item,
        id: generateId(),
        checked: false,
      }),
    );

    return Response.json({ meal, shoppingList });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log(`[refresh-meal] error — ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
