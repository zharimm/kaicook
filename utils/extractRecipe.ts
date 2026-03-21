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

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given messy HTML or page text from a recipe website, extract the recipe data and return ONLY a valid JSON object — no markdown, no explanation, no code block.

The JSON must match this exact shape:
{
  "title": string,
  "description": string | null,
  "servings": number,
  "totalTime": string | null,
  "ingredients": [{ "name": string, "quantity": number, "unit": string }],
  "steps": [string],
  "swappableIngredients": [{ "name": string, "substitutes": [{ "label": string, "type": "safe" | "ratio_change" | "flavour_change" | "dietary" | "availability", "ratioChange": number | null, "note": string }] }]
}

Rules:
- quantity must be a number (use 0 if unknown)
- unit can be empty string "" if there is no unit (e.g. "2 eggs")
- steps must be plain strings, no numbering
- If a field is missing, use null (or 0 for servings if unknown)
- Strip ads, navigation, comments, and any irrelevant text
- swappableIngredients: identify ingredients that have common substitutes (e.g. butter→olive oil, sugar→honey, flour→almond flour, milk→oat milk). The "name" must exactly match an ingredient name from the ingredients array. For each substitute provide:
  - label: name of the substitute
  - type: "safe" (1:1 drop-in), "ratio_change" (different amount needed), "flavour_change" (alters taste), "dietary" (allergen/diet swap like dairy-free, gluten-free), "availability" (hard-to-find ingredient alternative)
  - ratioChange: multiplier vs original quantity (e.g. 0.75 means use 75%), null if 1:1
  - note: brief guidance (1 sentence) on how the swap affects the recipe
- Include 2-4 substitutes per swappable ingredient. Focus on the most impactful/common swaps.`;

export async function extractRecipe(pageText: string): Promise<Recipe> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Extract the recipe from this page content:\n\n${pageText.slice(0, 50000)}`,
      },
    ],
  });

  console.log('[kaiCook] Raw Anthropic response:', JSON.stringify(response, null, 2));

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  console.log('[kaiCook] Extracted text block:', text);

  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  const recipe: Recipe = JSON.parse(clean);
  return recipe;
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
  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
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
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as SwapResult;
}
