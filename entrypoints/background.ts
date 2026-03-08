import { extractRecipe } from '../utils/extractRecipe';

// Temporary key verification — remove after debugging
console.log('[kaiCook] VITE_ANTHROPIC_API_KEY (first 20):', (import.meta.env.VITE_ANTHROPIC_API_KEY as string)?.slice(0, 20) ?? 'undefined');
console.log('[kaiCook] ANTHROPIC_API_KEY (first 20):', (import.meta.env.ANTHROPIC_API_KEY as string)?.slice(0, 20) ?? 'undefined');

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
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_TAB_URL') {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        console.log('[kaiCook] tabs.query result:', JSON.stringify(tabs));
        const tab = tabs[0];
        const url = tab?.url ?? null;
        console.log('[kaiCook] tabs[0]:', JSON.stringify(tab));
        console.log('[kaiCook] tabs[0].url:', url, '— defined?', url !== null && url !== undefined);
        if (!url) {
          console.warn('[kaiCook] url is undefined — extension may be missing the "tabs" permission, or the tab is a chrome:// page');
        }
        sendResponse({ url });
      });
      return true;
    }

    if (message.type === 'EXTRACT_RECIPE') {
      console.log('[kaiCook] EXTRACT_RECIPE received');

      browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
        const tab = tabs[0];
        const tabId = tab?.id;
        console.log('[kaiCook] Active tab:', { id: tabId, url: tab?.url, status: tab?.status });

        if (!tabId) {
          console.error('[kaiCook] No active tab ID found');
          sendResponse({ error: 'No active tab found' });
          return;
        }

        try {
          await ensureContentScript(tabId);

          console.log('[kaiCook] Sending GET_PAGE_TEXT to content script…');
          const contentResponse = await browser.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' });
          console.log('[kaiCook] Content script response received:', {
            hasText: !!contentResponse?.text,
            textLength: contentResponse?.text?.length ?? 0,
          });

          const pageText: string = contentResponse?.text ?? '';
          if (!pageText) {
            console.error('[kaiCook] Page text is empty — content script may not be injected yet');
            sendResponse({ error: 'Page text is empty. Try reloading the tab.' });
            return;
          }

          console.log('[kaiCook] Calling Anthropic API…');
          const recipe = await extractRecipe(pageText);
          console.log('[kaiCook] Recipe extracted successfully:', recipe);

          // Forward recipe to content script to render the overlay
          console.log('[kaiCook] Sending SHOW_OVERLAY to content script…');
          await browser.tabs.sendMessage(tabId, { type: 'SHOW_OVERLAY', recipe });

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
