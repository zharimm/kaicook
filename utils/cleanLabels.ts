/**
 * Local, regex-based label cleaning for ingredients.
 * Runs immediately after recipe parse, before any API calls.
 * Handles parenthetical stripping, comma splitting for prep notes,
 * and unit normalization without needing AI.
 */

import type { Ingredient } from './extractRecipe';

/**
 * Regex patterns for cleaning ingredient labels
 */
const UNIT_ALIASES: Record<string, string> = {
  // Imperial
  'teaspoon': 'tsp',
  'teaspoons': 'tsp',
  'tablespoon': 'tbsp',
  'tablespoons': 'tbsp',
  'cup': 'cup',
  'cups': 'cups',
  'ounce': 'oz',
  'ounces': 'oz',
  'pound': 'lb',
  'pounds': 'lbs',
  // Metric
  'gram': 'g',
  'grams': 'g',
  'kilogram': 'kg',
  'kilograms': 'kg',
  'milliliter': 'ml',
  'milliliters': 'ml',
  'liter': 'l',
  'liters': 'l',
  // Shorthand already normalized
  'tsp': 'tsp',
  'tbsp': 'tbsp',
  'oz': 'oz',
  'lb': 'lb',
  'lbs': 'lbs',
  'g': 'g',
  'kg': 'kg',
  'ml': 'ml',
  'l': 'l',
};

/**
 * Strip parenthetical content from ingredient names.
 * Examples:
 * - "chicken breast (256g)" → "chicken breast"
 * - "sugar (about 2 cups)" → "sugar"
 * - "flour (all-purpose)" → "flour (all-purpose)" [doesn't match if parens contain descriptor]
 */
function stripParentheticals(text: string): string {
  // Remove any parenthetical content that looks like a unit conversion or quantity note
  // Pattern: (number-like or "about" + unit-like content)
  return text
    .replace(/\s*\(\s*(?:about\s+)?[\d.]+\s*(?:[a-z]+)?\s*\)/gi, '')
    .trim();
}

/**
 * Split ingredient name and prep notes on comma.
 * Example: "chicken breast, diced" → name: "chicken breast", prep: "diced"
 */
function splitPrepNotes(
  text: string
): { name: string; prep?: string } {
  const parts = text.split(',').map(p => p.trim());
  if (parts.length === 1) {
    return { name: parts[0], prep: undefined };
  }
  // Take first part as name, rest as prep
  const name = parts[0];
  const prep = parts.slice(1).join(', ');
  return { name, prep: prep || undefined };
}

/**
 * Normalize unit aliases to canonical form.
 * "teaspoon" → "tsp", "tablespoon" → "tbsp", etc.
 */
function normalizeUnit(unit: string): string {
  if (!unit) return '';
  const lower = unit.toLowerCase().trim();
  return UNIT_ALIASES[lower] || unit;
}

/**
 * Clean a single ingredient's name and optional prep.
 * Non-mutating; returns a cleaned Ingredient.
 */
function cleanIngredient(ingredient: Ingredient): Ingredient {
  let name = ingredient.name.trim();

  // Phase 1: Strip parenthetical unit conversions
  name = stripParentheticals(name);

  // Phase 2: Split on comma for prep notes
  const { name: cleanName, prep: newPrep } = splitPrepNotes(name);

  // Phase 3: Normalize unit
  const unit = normalizeUnit(ingredient.unit);

  // Use new prep only if we didn't already have one
  const prep = ingredient.prep || newPrep;

  return {
    ...ingredient,
    name: cleanName,
    unit,
    prep: prep && prep.length > 0 ? prep : undefined,
  };
}

/**
 * Clean a list of ingredients in place (returns new array, doesn't mutate input).
 * This is the main public API.
 */
export function cleanIngredientLabels(
  ingredients: Ingredient[]
): Ingredient[] {
  return ingredients.map(cleanIngredient);
}
