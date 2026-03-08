import Anthropic from '@anthropic-ai/sdk';

export interface Recipe {
  title: string;
  description?: string;
  servings: number;
  totalTime?: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: string[];
}

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

export async function extractRecipe(pageText: string): Promise<Recipe> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
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
