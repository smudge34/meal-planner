import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { buildPrompt } from '@/lib/prompt';
import { Week } from '@/lib/types';
import { findRecipeUrls } from '@/lib/ai';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  console.log('[generate-week] request received — planned: 2 API calls (1 generation + 1 recipe search)');

  try {
    const body = await req.json();
    const history: Week[] = body.history ?? [];
    const cuisineRotationIndex: number = body.cuisineRotationIndex ?? 0;

    const prompt = buildPrompt(history, cuisineRotationIndex);
    const client = new Anthropic();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // API call 1: Generate the full meal plan (streaming)
          console.log('[generate-week] API call 1/2 — meal plan generation (streaming)');
          const response = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 8000,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          });

          let fullText = '';
          let generationInputTokens = 0;
          let generationOutputTokens = 0;

          for await (const event of response) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              fullText += event.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`),
              );
            }
            if (event.type === 'message_start') {
              generationInputTokens = event.message.usage.input_tokens;
            }
            if (event.type === 'message_delta') {
              generationOutputTokens = event.usage.output_tokens;
            }
          }

          console.log(
            `[generate-week] API call 1 complete — ` +
            `input_tokens=${generationInputTokens} output_tokens=${generationOutputTokens}`,
          );

          // API call 2: Find recipe URLs via web search (max 1 search per meal)
          console.log('[generate-week] API call 2/2 — recipe URL search (max 1 search per meal)');
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'searching' })}\n\n`),
          );

          let recipeUrls: Record<string, { url: string; site: string }> = {};
          try {
            const jsonMatch = fullText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsedPlan = JSON.parse(jsonMatch[0]);
              const mealNames: string[] = (parsedPlan.meals ?? []).map(
                (m: { name: string }) => m.name,
              );
              if (mealNames.length > 0) {
                console.log(`[generate-week] searching for ${mealNames.length} recipe URLs: ${mealNames.join(', ')}`);
                recipeUrls = await findRecipeUrls(client, mealNames);
              }
            }
          } catch {
            console.log('[generate-week] recipe search failed (non-fatal), continuing without URLs');
          }

          console.log(`[generate-week] recipeUrls returned: ${JSON.stringify(recipeUrls)}`);
          console.log(`[generate-week] complete — total API calls: 2, recipe URLs found: ${Object.keys(recipeUrls).length}`);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, fullText, recipeUrls })}\n\n`,
            ),
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
