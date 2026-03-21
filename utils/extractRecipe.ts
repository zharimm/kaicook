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

export interface Recipe {
  title: string;
  description?: string;
  servings: number;
  totalTime?: string;
  ingredients: { name: string; quantity: number; unit: string }[];
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

/** Lazy-load swappable ingredients for an already-extracted recipe */
export async function fetchSwappableIngredients(recipe: Recipe): Promise<SwappableIngredient[]> {
  const client = getClient();

  const ingredientNames = recipe.ingredients.map(i => i.name).join(', ');

  const response = await callWithRetry(() =>
    withTimeout(
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `You are a cooking assistant. Given a recipe's ingredient list, identify which ingredients have common substitutes and return ONLY a valid JSON array — no markdown, no explanation, no code block.

Each element: { "name": string, "substitutes": [{ "label": string, "type": "safe" | "ratio_change" | "flavour_change" | "dietary" | "availability", "ratioChange": number | null, "note": string }] }

Rules:
- "name" must exactly match one of the provided ingredient names
- Include 2-4 substitutes per swappable ingredient
- Only include ingredients that have meaningful, common swaps
- type: "safe" = 1:1 drop-in, "ratio_change" = different amount, "flavour_change" = alters taste, "dietary" = allergen/diet swap, "availability" = hard-to-find alternative
- ratioChange: multiplier vs original (e.g. 0.75 = use 75%), null if 1:1
- note: 1 sentence on how the swap affects the recipe`,
        messages: [{
          role: 'user',
          content: `Recipe: "${recipe.title}"\nIngredients: ${ingredientNames}`,
        }],
      }),
      API_TIMEOUT_MS,
    )
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as SwappableIngredient[];
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
