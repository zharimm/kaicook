/**
 * Static swap lookup — common ingredient substitutes that don't need AI.
 * Covers ~80% of typical recipe swaps. Instant, no API call.
 */

import type { SwappableIngredient, Substitute } from './extractRecipe';

type SubEntry = Omit<Substitute, 'label'> & { label: string };

const SWAP_DB: Record<string, SubEntry[]> = {
  butter: [
    { label: 'olive oil', type: 'dietary', ratioChange: 0.75, note: 'Use ¾ the amount; works best in savoury dishes.' },
    { label: 'coconut oil', type: 'dietary', ratioChange: 1, note: 'Adds subtle coconut flavour; solid at room temp like butter.' },
    { label: 'applesauce', type: 'dietary', ratioChange: 0.5, note: 'Use half the amount; best in baking for moisture.' },
  ],
  milk: [
    { label: 'oat milk', type: 'dietary', note: 'Creamy texture, works in most recipes.' },
    { label: 'almond milk', type: 'dietary', note: 'Lighter, slightly nutty; good for baking.' },
    { label: 'coconut milk', type: 'flavour_change', note: 'Richer and sweeter; great in curries and desserts.' },
  ],
  'whole milk': [
    { label: 'oat milk', type: 'dietary', note: 'Closest in creaminess to whole milk.' },
    { label: '2% milk', type: 'safe', note: 'Slightly less rich but works as a direct swap.' },
  ],
  cream: [
    { label: 'coconut cream', type: 'dietary', note: 'Rich and dairy-free; slight coconut flavour.' },
    { label: 'cashew cream', type: 'dietary', note: 'Neutral flavour, blends smooth.' },
  ],
  'heavy cream': [
    { label: 'coconut cream', type: 'dietary', note: 'Thick and rich; slight coconut flavour.' },
    { label: 'full-fat coconut milk', type: 'dietary', note: 'Lighter than cream but works in most sauces.' },
  ],
  'sour cream': [
    { label: 'Greek yogurt', type: 'safe', note: 'Tangier and higher in protein; works 1:1.' },
    { label: 'cashew cream', type: 'dietary', note: 'Add a squeeze of lemon for tanginess.' },
  ],
  egg: [
    { label: 'flax egg (1 tbsp ground flax + 3 tbsp water)', type: 'dietary', note: 'Works as binder in baking; let it gel 5 min.' },
    { label: 'banana (½ mashed)', type: 'dietary', note: 'Adds sweetness and moisture; best in sweet baking.' },
  ],
  eggs: [
    { label: 'flax eggs', type: 'dietary', note: '1 tbsp ground flax + 3 tbsp water per egg; let gel 5 min.' },
    { label: 'mashed banana', type: 'dietary', ratioChange: 0.5, note: 'Half a banana per egg; adds sweetness.' },
  ],
  sugar: [
    { label: 'honey', type: 'ratio_change', ratioChange: 0.75, note: 'Use ¾ the amount; adds moisture, reduce other liquids slightly.' },
    { label: 'maple syrup', type: 'ratio_change', ratioChange: 0.75, note: 'Use ¾ the amount; distinct flavour works well in baking.' },
    { label: 'coconut sugar', type: 'safe', note: '1:1 swap; slightly caramelly, lower glycemic index.' },
  ],
  'brown sugar': [
    { label: 'coconut sugar', type: 'safe', note: 'Similar caramel flavour; works 1:1.' },
    { label: 'white sugar + molasses', type: 'safe', note: '1 cup sugar + 1 tbsp molasses = 1 cup brown sugar.' },
  ],
  flour: [
    { label: 'almond flour', type: 'dietary', ratioChange: 1, note: 'Gluten-free; denser result, works best in cookies and cakes.' },
    { label: 'oat flour', type: 'dietary', note: 'Blend oats fine; slightly denser, mild flavour.' },
    { label: 'gluten-free flour blend', type: 'dietary', note: 'Check the blend includes xanthan gum for binding.' },
  ],
  'all-purpose flour': [
    { label: 'almond flour', type: 'dietary', note: 'Gluten-free; denser, works best in cookies and quick breads.' },
    { label: 'whole wheat flour', type: 'safe', note: 'Slightly denser and nuttier; use same amount.' },
    { label: 'gluten-free flour blend', type: 'dietary', note: 'Look for a 1:1 baking blend with xanthan gum.' },
  ],
  'vegetable oil': [
    { label: 'olive oil', type: 'flavour_change', note: 'Stronger flavour; best in savoury dishes.' },
    { label: 'coconut oil (melted)', type: 'safe', note: 'Neutral refined version works 1:1.' },
    { label: 'avocado oil', type: 'safe', note: 'Neutral flavour, high smoke point.' },
  ],
  'olive oil': [
    { label: 'avocado oil', type: 'safe', note: 'Neutral flavour, higher smoke point.' },
    { label: 'coconut oil', type: 'flavour_change', note: 'Adds subtle sweetness; use refined for neutral taste.' },
  ],
  'soy sauce': [
    { label: 'tamari', type: 'dietary', note: 'Gluten-free and slightly richer; works 1:1.' },
    { label: 'coconut aminos', type: 'dietary', note: 'Sweeter and less salty; may need more.' },
  ],
  garlic: [
    { label: 'garlic powder', type: 'availability', ratioChange: 0.25, note: '¼ tsp powder per clove; add earlier in cooking.' },
  ],
  onion: [
    { label: 'shallot', type: 'flavour_change', note: 'Milder and sweeter; works well in dressings and sauces.' },
    { label: 'onion powder', type: 'availability', note: '1 tsp per small onion; won\'t add texture.' },
  ],
  'chicken broth': [
    { label: 'vegetable broth', type: 'dietary', note: 'Direct swap; lighter flavour.' },
    { label: 'mushroom broth', type: 'flavour_change', note: 'Adds umami depth; great in soups and risottos.' },
  ],
  'chicken stock': [
    { label: 'vegetable stock', type: 'dietary', note: 'Direct swap; works in any recipe.' },
  ],
  'white wine': [
    { label: 'chicken broth + splash of vinegar', type: 'availability', note: 'Mimics acidity without alcohol.' },
    { label: 'white grape juice', type: 'availability', note: 'Sweeter; reduce other sugars slightly.' },
  ],
  'red wine': [
    { label: 'beef broth + splash of red wine vinegar', type: 'availability', note: 'Adds depth without alcohol.' },
    { label: 'grape juice', type: 'availability', note: 'Sweeter; works in braises and stews.' },
  ],
  'breadcrumbs': [
    { label: 'crushed crackers', type: 'availability', note: 'Similar crunch; saltier.' },
    { label: 'rolled oats', type: 'dietary', note: 'Pulse in blender; works as binder or coating.' },
  ],
  rice: [
    { label: 'quinoa', type: 'dietary', note: 'Higher protein; slightly nutty, cooks similarly.' },
    { label: 'cauliflower rice', type: 'dietary', note: 'Low-carb; much lighter texture, cooks faster.' },
  ],
  pasta: [
    { label: 'zucchini noodles', type: 'dietary', note: 'Low-carb; salt and drain to avoid wateriness.' },
    { label: 'gluten-free pasta', type: 'dietary', note: 'Watch cook time — tends to go mushy faster.' },
  ],
  'parmesan': [
    { label: 'nutritional yeast', type: 'dietary', note: 'Vegan, cheesy flavour; use 2-3 tbsp as starting point.' },
    { label: 'pecorino romano', type: 'flavour_change', note: 'Sharper and saltier; use slightly less.' },
  ],
  'mozzarella': [
    { label: 'provolone', type: 'flavour_change', note: 'Melts well; slightly sharper taste.' },
    { label: 'vegan mozzarella', type: 'dietary', note: 'Melting varies by brand; best in pizza and bakes.' },
  ],
  'lemon juice': [
    { label: 'lime juice', type: 'safe', note: 'Slightly different citrus note but works 1:1.' },
    { label: 'white vinegar', type: 'ratio_change', ratioChange: 0.5, note: 'Use half; stronger acidity, no citrus flavour.' },
  ],
  honey: [
    { label: 'maple syrup', type: 'safe', note: 'Works 1:1; slightly different flavour profile.' },
    { label: 'agave nectar', type: 'safe', note: 'Thinner and sweeter; use slightly less.' },
  ],
  'baking powder': [
    { label: 'baking soda + cream of tartar', type: 'safe', note: '¼ tsp soda + ½ tsp cream of tartar per 1 tsp powder.' },
  ],
  'baking soda': [
    { label: 'baking powder', type: 'ratio_change', ratioChange: 3, note: 'Use 3x the amount; baking powder already contains acid.' },
  ],
  cornstarch: [
    { label: 'arrowroot powder', type: 'safe', note: 'Works 1:1 for thickening; don\'t boil.' },
    { label: 'flour', type: 'ratio_change', ratioChange: 2, note: 'Use double the amount; results in slightly cloudier sauce.' },
  ],
  'tomato paste': [
    { label: 'tomato sauce', type: 'ratio_change', ratioChange: 3, note: 'Use 3x the amount; thinner, reduce other liquids.' },
    { label: 'sun-dried tomatoes (blended)', type: 'flavour_change', note: 'More intense; add a splash of water.' },
  ],
  'cocoa powder': [
    { label: 'cacao powder', type: 'flavour_change', note: 'Less processed, slightly more bitter; works 1:1.' },
    { label: 'carob powder', type: 'flavour_change', note: 'Naturally sweeter, no caffeine; similar colour.' },
  ],
  'vanilla extract': [
    { label: 'vanilla bean paste', type: 'safe', note: 'Richer flavour with visible bean specks; works 1:1.' },
    { label: 'almond extract', type: 'flavour_change', ratioChange: 0.5, note: 'Use half; stronger, nutty flavour.' },
  ],
  'buttermilk': [
    { label: 'milk + lemon juice', type: 'safe', note: '1 cup milk + 1 tbsp lemon juice; let sit 5 min.' },
    { label: 'plain yogurt', type: 'safe', note: 'Thin with a splash of milk to match consistency.' },
  ],
  yogurt: [
    { label: 'sour cream', type: 'safe', note: 'Richer and tangier; works 1:1 in baking and sauces.' },
    { label: 'coconut yogurt', type: 'dietary', note: 'Dairy-free; slightly sweeter, works in most recipes.' },
  ],
  'salt': [
    { label: 'soy sauce', type: 'flavour_change', ratioChange: 0.25, note: 'Use ¼ tsp per tsp salt; adds umami, darkens colour.' },
  ],
};

// Normalise keys: lowercase, trim, strip trailing 's' for basic plurals
function normalise(name: string): string {
  return name.toLowerCase().trim();
}

// All DB keys sorted longest-first so "all-purpose flour" matches before "flour"
const DB_KEYS = Object.keys(SWAP_DB).sort((a, b) => b.length - a.length);

/**
 * Find static swaps for an ingredient name.
 * Tries: exact → depluralized → contains a known key → key contained in name.
 * e.g. "granulated sugar" matches "sugar", "unsalted butter" matches "butter"
 */
function findStaticMatch(key: string): SubEntry[] | null {
  // Exact match
  if (SWAP_DB[key]) return SWAP_DB[key];
  // Depluralized
  const singular = key.replace(/es$/, '').replace(/s$/, '');
  if (SWAP_DB[singular]) return SWAP_DB[singular];
  // Compound match: ingredient contains a known key (e.g. "granulated sugar" → "sugar")
  for (const dbKey of DB_KEYS) {
    if (key.includes(dbKey)) return SWAP_DB[dbKey];
  }
  return null;
}

/**
 * Match recipe ingredients against the static swap database.
 * Returns swappable ingredients instantly — no API call.
 */
export function getStaticSwaps(ingredients: { name: string }[]): SwappableIngredient[] {
  const results: SwappableIngredient[] = [];

  for (const ing of ingredients) {
    const key = normalise(ing.name);
    const subs = findStaticMatch(key);

    if (subs) {
      results.push({
        name: ing.name, // preserve original casing to match ingredients array
        substitutes: subs.map(s => ({ ...s, ratioChange: s.ratioChange ?? undefined })),
      });
    }
  }

  return results;
}
