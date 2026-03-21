import { extractRecipe, fetchSwappableIngredients, swapIngredient, type Recipe } from '../utils/extractRecipe';
import { parseJsonLdLocally } from '../utils/parseJsonLd';

// In-memory recipe cache keyed by tabId. Cleared when the tab navigates to a new URL.
const recipeCache = new Map<number, Recipe>();

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    console.log('[kaiCook] Injecting content script…');
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  }
}

// ─── URL-based persistent cache ────────────────────────────────────────────────
const URL_CACHE_KEY = 'recipeUrlCache';
const URL_CACHE_MAX = 50;

async function getUrlCache(): Promise<Record<string, Recipe>> {
  const result = await browser.storage.local.get(URL_CACHE_KEY);
  return (result[URL_CACHE_KEY] as Record<string, Recipe>) ?? {};
}

async function setUrlCache(url: string, recipe: Recipe): Promise<void> {
  const cache = await getUrlCache();
  cache[url] = recipe;
  // Evict oldest entries if over limit
  const keys = Object.keys(cache);
  if (keys.length > URL_CACHE_MAX) {
    for (const key of keys.slice(0, keys.length - URL_CACHE_MAX)) {
      delete cache[key];
    }
  }
  await browser.storage.local.set({ [URL_CACHE_KEY]: cache });
}

// ─── Recipe signal check ──────────────────────────────────────────────────────
function hasRecipeSignals(text: string): { pass: boolean; count: number } {
  const lower = text.toLowerCase();
  const REQUIRED = ['ingredients', 'instructions', 'steps', 'directions'];
  const SUPPORTING = ['cook', 'bake', 'prep time', 'servings', 'recipe', 'preheat', 'tablespoon', 'teaspoon', 'cup'];

  const hasRequired = REQUIRED.some(kw => lower.includes(kw));
  const supportCount = SUPPORTING.filter(kw => lower.includes(kw)).length;

  // Must have at least one required signal AND one supporting signal
  return { pass: hasRequired && supportCount >= 1, count: (hasRequired ? 1 : 0) + supportCount };
}

export default defineBackground(() => {
  // Clear stale URL cache from previous builds (old API-extracted recipes may have raw ISO times)
  browser.storage.local.remove(URL_CACHE_KEY);

  // Evict in-memory cache when a tab navigates to a new URL.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      recipeCache.delete(tabId);
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_TAB_URL') {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tab = tabs[0];
        const url = tab?.url ?? null;
        if (url?.startsWith('chrome-extension://')) {
          sendResponse({ url, kaicook: true });
        } else {
          sendResponse({ url });
        }
      });
      return true;
    }

    if (message.type === 'FETCH_SWAPS') {
      const { recipe } = message;
      fetchSwappableIngredients(recipe)
        .then((swaps) => sendResponse({ swaps }))
        .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
      return true;
    }

    if (message.type === 'SWAP_INGREDIENT') {
      const { ingredientName, substituteName, recipeTitle, recipeSteps } = message;
      swapIngredient(ingredientName, substituteName, recipeTitle, recipeSteps)
        .then((result) => sendResponse({ result }))
        .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
      return true;
    }

    if (message.type === 'EXTRACT_RECIPE') {
      console.log('[kaiCook] EXTRACT_RECIPE received');

      browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0];
        const tabId = tab?.id;
        const tabUrl = tab?.url ?? '';

        if (!tabId) {
          sendResponse({ error: 'No active tab found' });
          return;
        }

        try {
          await ensureContentScript(tabId);

          // Cache hit — in-memory (per tab)
          const cached = recipeCache.get(tabId);
          if (cached) {
            console.log('[kaiCook] Memory cache hit');
            await browser.storage.session.set({ recipe: cached, recipeSourceUrl: tabUrl });
            browser.tabs.create({ url: browser.runtime.getURL('recipe.html') });
            sendResponse({ recipe: cached });
            return;
          }

          // Cache hit — URL-based persistent cache
          if (tabUrl) {
            const urlCache = await getUrlCache();
            if (urlCache[tabUrl]) {
              console.log('[kaiCook] URL cache hit');
              const recipe = urlCache[tabUrl];
              recipeCache.set(tabId, recipe);
              await browser.storage.session.set({ recipe, recipeSourceUrl: tabUrl });
              browser.tabs.create({ url: browser.runtime.getURL('recipe.html') });
              sendResponse({ recipe });
              return;
            }
          }

          const contentResponse = await browser.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' });
          const pageText: string = contentResponse?.text ?? '';
          const jsonLd: string | undefined = contentResponse?.jsonLd;
          const method: string = contentResponse?.method ?? 'fallback';

          console.log('[kaiCook] Content extraction:', { method, textLength: pageText.length, hasJsonLd: !!jsonLd });

          if (!pageText && !jsonLd) {
            sendResponse({ error: 'Page text is empty. Try reloading the tab.' });
            return;
          }

          // Fast path: try local JSON-LD parsing first — no API call needed
          let recipe: Recipe | null = null;
          if (jsonLd) {
            console.log('[kaiCook] JSON-LD found, attempting local parse…');
            recipe = parseJsonLdLocally(jsonLd);
            if (recipe) {
              console.log('[kaiCook] ✅ Local parse succeeded — skipping API call:', recipe.title);
            } else {
              console.log('[kaiCook] ⚠️ Local parse returned null — falling back to API');
            }
          }

          // Slow path: fall back to API extraction
          if (!recipe) {
            // Pre-check: require recipe signals (skip if we have JSON-LD — that's already confirmed)
            if (!jsonLd) {
              const signals = hasRecipeSignals(pageText);
              if (!signals.pass) {
                const error = signals.count === 0
                  ? "Hey, nice website. But this page has zero calories. 🍽️"
                  : "Almost! This looks like a food site but I can't find a recipe here.";
                console.log('[kaiCook] Insufficient recipe signals:', signals.count);
                sendResponse({ error });
                return;
              }
            }

            console.log('[kaiCook] Calling Anthropic API…');
            recipe = await extractRecipe(pageText, jsonLd);
          }
          console.log('[kaiCook] Recipe extracted:', recipe.title);

          recipeCache.set(tabId, recipe);
          if (tabUrl) setUrlCache(tabUrl, recipe);

          await browser.storage.session.set({ recipe, recipeSourceUrl: tabUrl });
          browser.tabs.create({ url: browser.runtime.getURL('recipe.html') });

          sendResponse({ recipe });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[kaiCook] Extraction failed:', msg);
          sendResponse({ error: msg });
        }
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[kaiCook] tabs.query failed:', msg);
        sendResponse({ error: `Failed to query active tab: ${msg}` });
      });
      return true;
    }
  });
});
