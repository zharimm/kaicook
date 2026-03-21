import { extractRecipe, swapIngredient, type Recipe } from '../utils/extractRecipe';

// Temporary key verification — remove after debugging
console.log('[kaiCook] VITE_ANTHROPIC_API_KEY (first 20):', (import.meta.env.VITE_ANTHROPIC_API_KEY as string)?.slice(0, 20) ?? 'undefined');
console.log('[kaiCook] ANTHROPIC_API_KEY (first 20):', (import.meta.env.ANTHROPIC_API_KEY as string)?.slice(0, 20) ?? 'undefined');

// In-memory recipe cache keyed by tabId. Cleared when the tab navigates to a new URL.
const recipeCache = new Map<number, Recipe>();

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'PING' });
    console.log('[kaiCook] Content script already active');
  } catch {
    console.log('[kaiCook] Content script not responding — injecting programmatically…');
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
    // Allow the injected script to initialize and register its message listener
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[kaiCook] Content script injected');
  }
}

export default defineBackground(() => {
  // Evict cache when a tab navigates to a new URL so stale recipes are never served.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      recipeCache.delete(tabId);
      console.log('[kaiCook] Cache cleared for tab', tabId, 'due to navigation');
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_TAB_URL') {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        console.log('[kaiCook] tabs.query result:', JSON.stringify(tabs));
        const tab = tabs[0];
        const url = tab?.url ?? null;
        console.log('[kaiCook] tabs[0]:', JSON.stringify(tab));
        console.log('[kaiCook] tabs[0].url:', url, '— defined?', url !== null && url !== undefined);
        if (!url) {
          console.log('[kaiCook] url is undefined — extension may be missing the "tabs" permission, or the tab is a chrome:// page');
        }
        if (url?.startsWith('chrome-extension://')) {
          console.log('[kaiCook] Active tab is a chrome-extension:// page — returning kaicook flag');
          sendResponse({ url, kaicook: true });
        } else {
          sendResponse({ url });
        }
      });
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
        console.log('[kaiCook] Active tab:', { id: tabId, url: tab?.url, status: tab?.status });

        if (!tabId) {
          console.log('[kaiCook] No active tab ID found');
          sendResponse({ error: 'No active tab found' });
          return;
        }

        try {
          await ensureContentScript(tabId);

          // Cache hit — skip API call and open the recipe tab immediately
          const cached = recipeCache.get(tabId);
          if (cached) {
            console.log('[kaiCook] Cache hit for tab', tabId, '— skipping API call');
            await browser.storage.session.set({ recipe: cached, recipeSourceUrl: tab.url ?? '' });
            browser.tabs.create({ url: browser.runtime.getURL('recipe.html') });
            sendResponse({ recipe: cached });
            return;
          }

          console.log('[kaiCook] Sending GET_PAGE_TEXT to content script…');
          const contentResponse = await browser.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' });
          console.log('[kaiCook] Content script response received:', {
            hasText: !!contentResponse?.text,
            textLength: contentResponse?.text?.length ?? 0,
          });

          const pageText: string = contentResponse?.text ?? '';
          if (!pageText) {
            console.log('[kaiCook] Page text is empty — content script may not be injected yet');
            sendResponse({ error: 'Page text is empty. Try reloading the tab.' });
            return;
          }

          // Pre-check: count recipe signals in the first 500 chars of page text.
          // Avoids burning an API call on pages that clearly aren't recipes.
          const snippet = pageText.slice(0, 500).toLowerCase();
          const SIGNALS = ['ingredients', 'instructions', 'steps', 'cook', 'bake', 'prep time', 'servings', 'recipe'];
          const signalCount = SIGNALS.filter((kw) => snippet.includes(kw)).length;
          if (signalCount < 2) {
            const error = signalCount === 0
              ? "Hey, nice website. But this page has zero calories. 🍽️"
              : "Almost! This looks like a food site but I can't find a recipe here.";
            console.log('[kaiCook] Insufficient recipe signals (%d) — skipping API call', signalCount);
            sendResponse({ error });
            return;
          }

          console.log('[kaiCook] Calling Anthropic API…');
          const recipe = await extractRecipe(pageText);
          console.log('[kaiCook] Recipe extracted successfully:', recipe);

          recipeCache.set(tabId, recipe);

          // Store in session storage and open the dedicated recipe tab
          await browser.storage.session.set({ recipe, recipeSourceUrl: tab.url ?? '' });
          browser.tabs.create({ url: browser.runtime.getURL('recipe.html') });

          sendResponse({ recipe });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[kaiCook] Extraction failed at step:', message, err);
          sendResponse({ error: message });
        }
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[kaiCook] tabs.query failed:', message, err);
        sendResponse({ error: `Failed to query active tab: ${message}` });
      });
      return true;
    }
  });
});
