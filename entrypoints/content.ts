export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[kaiCook] Content script loaded.');

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ pong: true });
      }

      if (message.type === 'GET_PAGE_TEXT') {
        const result = extractPageContent();
        sendResponse(result);
      }

      return true;
    });
  },
});

// ─── Layered content extraction ───────────────────────────────────────────────

interface PageContent {
  text: string;
  jsonLd?: string;
  method: 'json-ld' | 'semantic' | 'fallback';
}

function extractPageContent(): PageContent {
  // Layer 1 — JSON-LD structured data (best case: skip DOM text entirely)
  const jsonLd = extractJsonLd();
  if (jsonLd) {
    console.log('[kaiCook] JSON-LD found on page');
    // Only send minimal text if JSON-LD is missing key fields
    try {
      const parsed = JSON.parse(jsonLd);
      const hasIngredients = parsed.recipeIngredient?.length > 0;
      const hasSteps = parsed.recipeInstructions?.length > 0;
      if (hasIngredients && hasSteps) {
        console.log('[kaiCook] JSON-LD is complete — skipping DOM text extraction');
        return { text: '', jsonLd, method: 'json-ld' };
      }
      console.log('[kaiCook] JSON-LD incomplete — sending title as context');
    } catch { /* parse failed, send minimal context */ }
    return { text: document.title, jsonLd, method: 'json-ld' };
  }
  console.log('[kaiCook] No JSON-LD found, trying semantic/fallback');

  // Layer 2 — Semantic HTML: extract from <article>, <main>, or recipe containers
  const semantic = extractSemantic();
  if (semantic) {
    return { text: semantic, method: 'semantic' };
  }

  // Layer 3 — Cleaned fallback: strip irrelevant elements, then extract text
  const cleaned = extractCleaned();
  return { text: cleaned, method: 'fallback' };
}

function extractJsonLd(): string | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      // Could be a single object or an array
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        // Check direct @type
        if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
          return JSON.stringify(item);
        }
        // Check @graph array (common in WordPress/Yoast)
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          const recipe = item['@graph'].find((node: Record<string, unknown>) =>
            node['@type'] === 'Recipe' || (Array.isArray(node['@type']) && node['@type'].includes('Recipe'))
          );
          if (recipe) return JSON.stringify(recipe);
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  return null;
}

function extractSemantic(): string | null {
  // Try recipe-specific containers first
  const recipeSelectors = [
    '[itemtype*="schema.org/Recipe"]',
    '[class*="recipe-body"]',
    '[class*="recipe-content"]',
    '[class*="recipe-card"]',
    '[class*="wprm-recipe"]',
    '[class*="tasty-recipe"]',
    '[class*="easyrecipe"]',
    '[id*="recipe"]',
  ];

  for (const selector of recipeSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 200) {
      return el.textContent.trim();
    }
  }

  // Fall back to <article> or <main>
  for (const tag of ['article', 'main', '[role="main"]']) {
    const el = document.querySelector(tag);
    if (el && el.textContent && el.textContent.trim().length > 200) {
      return el.textContent.trim();
    }
  }

  return null;
}

function extractCleaned(): string {
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Remove noisy elements
  const removeSelectors = [
    'nav', 'footer', 'aside', 'header',
    '[class*="comment"]', '[id*="comment"]',
    '[class*="sidebar"]', '[id*="sidebar"]',
    '[class*="advertisement"]', '[class*="ad-"]', '[class*="ads-"]',
    '[class*="related"]', '[class*="newsletter"]',
    '[class*="social"]', '[class*="share"]',
    'script', 'style', 'iframe', 'noscript',
  ];

  for (const selector of removeSelectors) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }

  return clone.textContent?.trim() ?? '';
}
