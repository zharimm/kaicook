/**
 * Local JSON-LD recipe parser — no API call needed.
 * Ported from the v0 prototype's `route.ts` and adapted to kaiCook's Recipe interface.
 * Handles the majority of recipe sites (AllRecipes, Serious Eats, NYT Cooking, etc.)
 */

import type { Recipe } from './extractRecipe';

/**
 * Try to parse a JSON-LD string directly into a Recipe.
 * Returns null if the data is too incomplete (missing ingredients or steps).
 */
export function parseJsonLdLocally(jsonLdString: string): Recipe | null {
  try {
    const data = JSON.parse(jsonLdString);
    return parseRecipeObject(data);
  } catch {
    return null;
  }
}

function parseRecipeObject(data: Record<string, unknown>): Recipe | null {
  const ingredients = parseIngredients(data);
  const steps = parseInstructions(data);

  // If we don't have both ingredients and steps, bail — let the API handle it
  if (ingredients.length === 0 || steps.length === 0) {
    return null;
  }

  return {
    title: cleanText(String(data.name || 'Untitled Recipe')),
    description: data.description ? cleanText(String(data.description)) : undefined,
    servings: parseServings(data.recipeYield),
    totalTime: parseTime(data.totalTime) ?? parseTime(data.cookTime) ?? undefined,
    ingredients,
    steps,
  };
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

const QUANTITY_RE = /^([\d¼½¾⅓⅔⅛⅜⅝⅞/.\s-]+)\s*/;
const UNITS = [
  'cups?', 'tbsp', 'tablespoons?', 'tsp', 'teaspoons?',
  'oz', 'ounces?', 'lbs?', 'pounds?', 'g', 'grams?',
  'kg', 'kilograms?', 'ml', 'milliliters?', 'l', 'liters?', 'litres?',
  'quarts?', 'pints?', 'gallons?', 'pinch(?:es)?', 'dash(?:es)?',
  'cloves?', 'cans?', 'packages?', 'sticks?', 'slices?', 'pieces?',
  'bunch(?:es)?', 'sprigs?', 'heads?', 'stalks?',
];
const UNIT_RE = new RegExp(`^(${UNITS.join('|')})\\.?\\s+`, 'i');

function parseIngredientString(raw: string): { name: string; quantity: number; unit: string } {
  let text = cleanText(raw);

  // Extract quantity
  let quantity = 0;
  const qMatch = text.match(QUANTITY_RE);
  if (qMatch) {
    quantity = parseFraction(qMatch[1].trim());
    text = text.slice(qMatch[0].length);
  }

  // Extract unit
  let unit = '';
  const uMatch = text.match(UNIT_RE);
  if (uMatch) {
    unit = uMatch[1].toLowerCase().replace(/\.$/, '');
    text = text.slice(uMatch[0].length);
  }

  // Remaining text is the ingredient name — strip leading "of " if present
  const name = text.replace(/^of\s+/i, '').trim() || raw.trim();

  return { name, quantity, unit };
}

function parseFraction(s: string): number {
  // Handle unicode fractions
  const unicodeMap: Record<string, number> = {
    '¼': 0.25, '½': 0.5, '¾': 0.75,
    '⅓': 0.333, '⅔': 0.667,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  };

  let total = 0;
  let remaining = s.replace(/\s+/g, ' ').trim();

  // Check for unicode fractions mixed with whole numbers (e.g. "1 ½")
  for (const [char, val] of Object.entries(unicodeMap)) {
    if (remaining.includes(char)) {
      total += val;
      remaining = remaining.replace(char, '').trim();
    }
  }

  // Handle slash fractions like "1/2" or "1 1/2"
  const parts = remaining.split(/\s+/);
  for (const part of parts) {
    if (part.includes('/')) {
      const [num, den] = part.split('/').map(Number);
      if (den && !isNaN(num) && !isNaN(den)) {
        total += num / den;
      }
    } else {
      const n = parseFloat(part);
      if (!isNaN(n)) total += n;
    }
  }

  return total || 0;
}

function parseIngredients(data: Record<string, unknown>): Recipe['ingredients'] {
  if (!Array.isArray(data.recipeIngredient)) return [];
  return data.recipeIngredient
    .map((raw: unknown) => (typeof raw === 'string' ? parseIngredientString(raw) : null))
    .filter((i): i is NonNullable<typeof i> => i !== null && i.name.length > 0);
}

// ─── Instructions ────────────────────────────────────────────────────────────

function parseInstructions(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.recipeInstructions)) return [];

  const steps: string[] = [];
  for (const instruction of data.recipeInstructions) {
    if (typeof instruction === 'string') {
      const cleaned = cleanText(instruction);
      if (cleaned) steps.push(cleaned);
    } else if (isHowToStep(instruction)) {
      const text = cleanText(String(instruction.text || instruction.name || ''));
      if (text) steps.push(text);
    } else if (isHowToSection(instruction)) {
      if (Array.isArray(instruction.itemListElement)) {
        for (const step of instruction.itemListElement) {
          if (typeof step === 'string') {
            const cleaned = cleanText(step);
            if (cleaned) steps.push(cleaned);
          } else {
            const text = cleanText(String((step as Record<string, unknown>).text || (step as Record<string, unknown>).name || ''));
            if (text) steps.push(text);
          }
        }
      }
    }
  }
  return steps;
}

function isHowToStep(obj: unknown): obj is { '@type': 'HowToStep'; text?: string; name?: string } {
  return typeof obj === 'object' && obj !== null && (obj as Record<string, unknown>)['@type'] === 'HowToStep';
}

function isHowToSection(obj: unknown): obj is { '@type': 'HowToSection'; itemListElement?: unknown[] } {
  return typeof obj === 'object' && obj !== null && (obj as Record<string, unknown>)['@type'] === 'HowToSection';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseServings(yield_: unknown): number {
  if (typeof yield_ === 'number') return yield_;
  const str = Array.isArray(yield_) ? String(yield_[0]) : String(yield_ ?? '');
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseTime(duration: unknown): string | null {
  if (typeof duration !== 'string') return null;
  const match = duration.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return duration;
  const d = match[1] && match[1] !== '0' ? `${match[1]}d` : '';
  const h = match[2] && match[2] !== '0' ? `${match[2]}h` : '';
  const m = match[3] && match[3] !== '0' ? `${match[3]}m` : '';
  return [d, h, m].filter(Boolean).join(' ') || null;
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')       // strip any HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
