import Anthropic from '@anthropic-ai/sdk';

/**
 * Uses the Anthropic built-in web search tool to find one real recipe URL per
 * meal. Hard-capped at 1 search per meal via max_uses. MAX_ITERS is 2 because
 * web_search is a server-side tool — the first response should always be
 * end_turn; the second iteration is a safety fallback only.
 */
export async function findRecipeUrls(
  client: Anthropic,
  mealNames: string[],
): Promise<Record<string, { url: string; site: string }>> {
  const prompt = `For each dish below, use web search to find the closest matching real recipe on any trusted cooking website. The dish names are AI-generated so they may not exist verbatim — find the closest similar recipe.

Dishes:
${mealNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Instructions:
- Accept any trusted cooking website (BBC Good Food, Jamie Oliver, AllRecipes, Serious Eats, Delicious Magazine, Guardian Food, Food Network, etc.)
- The recipe name does NOT need to match exactly — find the closest version of the dish
- Always return results even for approximate matches
- Return ONLY valid JSON, no prose, no explanations, no markdown. Use the exact dish names as keys:
{"dish name": {"url": "https://...", "site": "Site Name"}, ...}
- Include an entry for every dish listed above`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  // Hard limit: exactly 1 search per meal, no more
  const maxSearches = mealNames.length;
  let totalApiCalls = 0;
  let totalSearches = 0;

  const MAX_ITERS = 2; // Server-side tool completes in 1 call; 2nd is safety only
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    totalApiCalls++;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      tools: [{
        type: 'web_search_20250305' as const,
        name: 'web_search' as const,
        max_uses: maxSearches,
      }],
      messages,
    });

    // Count actual web searches performed in this response
    const searchesThisCall = response.content.filter(
      (b) => b.type === 'web_search_tool_result',
    ).length;
    totalSearches += searchesThisCall;

    // Log all content block types so we can see if web search is actually firing
    const blockTypes = response.content.map((b) => b.type).join(', ');
    console.log(
      `[findRecipeUrls] iter=${iter + 1} apiCalls=${totalApiCalls} ` +
      `searches_this_call=${searchesThisCall} total_searches=${totalSearches} ` +
      `stop_reason=${response.stop_reason} meals=${mealNames.length} ` +
      `input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} ` +
      `block_types=[${blockTypes}]`,
    );

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      console.log(`[findRecipeUrls] raw text response (first 500 chars): ${text.slice(0, 500)}`);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const foundKeys = Object.keys(parsed);
          console.log(`[findRecipeUrls] parsed JSON keys: ${JSON.stringify(foundKeys)}`);
          console.log(`[findRecipeUrls] expected meal names: ${JSON.stringify(mealNames)}`);
          // Build result with case-insensitive fallback matching so key casing
          // differences between the AI's JSON keys and the original meal names don't
          // cause silent misses (e.g. "spaghetti carbonara" vs "Spaghetti Carbonara").
          const result: Record<string, { url: string; site: string }> = {};
          for (const name of mealNames) {
            const exact = parsed[name];
            if (exact) {
              result[name] = exact;
              console.log(`[findRecipeUrls] lookup "${name}" => ${exact.url} (exact match)`);
            } else {
              const lowerName = name.toLowerCase();
              const matchKey = foundKeys.find((k) => k.toLowerCase() === lowerName);
              if (matchKey) {
                result[name] = parsed[matchKey];
                console.log(`[findRecipeUrls] lookup "${name}" => ${parsed[matchKey].url} (case-insensitive match on "${matchKey}")`);
              } else {
                console.log(`[findRecipeUrls] lookup "${name}" => NOT FOUND (no exact or case-insensitive match in keys: ${JSON.stringify(foundKeys)})`);
              }
            }
          }
          return result;
        } catch (e) {
          console.log(`[findRecipeUrls] JSON.parse failed: ${e}`);
          console.log(`[findRecipeUrls] raw match[0]: ${match[0].slice(0, 300)}`);
          return {};
        }
      }
      console.log(`[findRecipeUrls] no JSON object found in text response`);
      return {};
    }

    // stop_reason === 'tool_use': nudge to finish (shouldn't happen for server tool)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages.push({ role: 'assistant', content: response.content as any });
    messages.push({
      role: 'user',
      content: 'Please provide the JSON output with all recipe URLs you found.',
    });
  }

  console.log(
    `[findRecipeUrls] exhausted iterations — total apiCalls=${totalApiCalls} totalSearches=${totalSearches}`,
  );
  return {};
}
