import Anthropic from '@anthropic-ai/sdk';

export interface Substitute {
  label: string;
  type: 'safe' | 'ratio_change' | 'flavour_change' | 'dietary' | 'availability';
  ratioChange?: number;
  note?: string;
}

export interface SwappableIngredient {
  name: string;
  substitutes: Substitute[];
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  prep?: string;          // separated prep notes, e.g. "finely chopped"
  originalText?: string;  // raw text before normalization
}

export interface Recipe {
  title: string;
  description?: string;
  servings: number;
  totalTime?: string;
  ingredients: Ingredient[];
  steps: string[];
  swappableIngredients?: SwappableIngredient[];
}

const DEBUG = false;

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given messy HTML or page text from a recipe website, extract the recipe data and return ONLY a valid JSON object — no markdown, no explanation, no code block.

The JSON must match this exact shape:
{
  "title": string,
  "description": string | null,
  "servings": number,
  "totalTime": string | null,
  "ingredients": [{ "name": string, "quantity": number, "unit": string }],
  "steps": [string]
}

Rules:
- quantity must be a number (use 0 if unknown)
- unit can be empty string "" if there is no unit (e.g. "2 eggs")
- steps must be plain strings, no numbering
- If a field is missing, use null (or 0 for servings if unknown)
- Strip ads, navigation, comments, and any irrelevant text`;

const SYSTEM_PROMPT_JSON_LD = `You are a recipe extraction assistant. You are given structured JSON-LD data from a recipe page. Extract the recipe and return ONLY a valid JSON object — no markdown, no explanation, no code block.

The JSON must match this exact shape:
{
  "title": string,
  "description": string | null,
  "servings": number,
  "totalTime": string | null,
  "ingredients": [{ "name": string, "quantity": number, "unit": string }],
  "steps": [string]
}

Rules:
- Parse ingredient strings into name, quantity (number, 0 if unknown), and unit (empty string if none)
- steps must be plain strings, no numbering
- If a field is missing, use null (or 0 for servings if unknown)`;

const API_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`API call timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // Only retry on transient errors, not auth/validation
    if (msg.includes('401') || msg.includes('invalid') || msg.includes('API key')) throw err;
    console.log(`[kaiCook] API call failed, retrying in ${delayMs}ms…`, msg);
    await new Promise(r => setTimeout(r, delayMs));
    return callWithRetry(fn, retries - 1, delayMs);
  }
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = import.meta.env.ANTHROPIC_API_KEY as string;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }
  return _client;
}

export async function extractRecipe(pageText: string, jsonLd?: string): Promise<Recipe> {
  const client = getClient();

  const hasJsonLd = !!jsonLd;
  const systemPrompt = hasJsonLd ? SYSTEM_PROMPT_JSON_LD : SYSTEM_PROMPT;
  const userContent = hasJsonLd
    ? `JSON-LD data:\n${jsonLd}`
    : `Extract the recipe from this page content:\n\n${pageText.slice(0, MAX_TEXT_LENGTH)}`;

  const response = await callWithRetry(() =>
    withTimeout(
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      API_TIMEOUT_MS,
    )
  );

  if (DEBUG) {
    console.log('[kaiCook] Raw Anthropic response:', JSON.stringify(response, null, 2));
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  console.log('[kaiCook] Extracted text length:', text.length);

  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  const recipe: Recipe = JSON.parse(clean);
  return recipe;
}

/** Merged normalize + swap: one API call that cleans up messy ingredient data AND generates substitutes */
export interface NormalizeAndSwapResult {
  normalizedIngredients: Ingredient[];
  swappableIngredients: SwappableIngredient[];
}

export async function fetchNormalizedAndSwaps(recipe: Recipe): Promise<NormalizeAndSwapResult> {
  const client = getClient();

  // Build a compact ingredient list showing what we parsed locally
  const ingredientList = recipe.ingredients.map((ing, i) =>
    `${i}: qty=${ing.quantity} unit="${ing.unit}" name="${ing.name}"`
  ).join('\n');

  const response = await callWithRetry(() =>
    withTimeout(
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        system: `You are a cooking assistant. Normalize recipe ingredients and suggest substitutes.

Return ONLY valid JSON:
{
  "ingredients": [{ "index": number, "name": string, "quantity": number, "unit": string, "prep": string | null }],
  "swaps": [{ "index": number, "substitutes": [{ "label": string, "type": "safe" | "ratio_change" | "flavour_change" | "dietary" | "availability", "ratioChange": number | null, "note": string }] }]
}

Rules:
- name: clean ingredient name only, strip parentheticals like "(256g)" or "(about 2 cups)"
- prep: separate instructions like "finely chopped" or "room temperature"
- quantity: number (0 if unknown), unit: canonical form or ""
- swaps: 2-3 common substitutes per ingredient, only if meaningful
- ratioChange: multiplier (0.75 = 75%), null if 1:1
- note: 1 sentence on impact`,
        messages: [{
          role: 'user',
          content: `Recipe: "${recipe.title}" (${recipe.servings} servings)\n\nIngredients:\n${ingredientList}`,
        }],
      }),
      API_TIMEOUT_MS,
    )
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(clean);

  // Map normalized ingredients back, preserving original text
  const normalizedIngredients: Ingredient[] = recipe.ingredients.map((orig, i) => {
    const norm = parsed.ingredients?.find((n: { index: number }) => n.index === i);
    if (!norm) return orig;
    return {
      name: norm.name || orig.name,
      quantity: typeof norm.quantity === 'number' ? norm.quantity : orig.quantity,
      unit: norm.unit ?? orig.unit,
      prep: norm.prep || undefined,
      originalText: orig.name !== norm.name ? orig.name : undefined,
    };
  });

  // Map swaps to use normalized names
  const swappableIngredients: SwappableIngredient[] = (parsed.swaps ?? []).map(
    (s: { index: number; substitutes: Substitute[] }) => ({
      name: normalizedIngredients[s.index]?.name ?? recipe.ingredients[s.index]?.name ?? '',
      substitutes: s.substitutes,
    })
  );

  return { normalizedIngredients, swappableIngredients };
}

export interface SwapResult {
  note: string;
  quantityMultiplier: number | null;
}

export async function swapIngredient(
  ingredientName: string,
  substituteName: string,
  recipeTitle: string,
  recipeSteps: string[],
): Promise<SwapResult> {
  const client = getClient();

  const response = await withTimeout(
    client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are a cooking assistant. Given an ingredient swap in a recipe, return ONLY a JSON object with:
{"note": string, "quantityMultiplier": number | null}
- note: 1-2 sentences on how this swap affects the recipe and any adjustments needed
- quantityMultiplier: ratio vs original (e.g. 0.75 = use 75%), null if 1:1
No markdown, no code blocks.`,
      messages: [
        {
          role: 'user',
          content: `Recipe: "${recipeTitle}"\nSteps: ${recipeSteps.join(' | ')}\n\nSwapping "${ingredientName}" → "${substituteName}". What's the impact?`,
        },
      ],
    }),
    API_TIMEOUT_MS,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as SwapResult;
}
