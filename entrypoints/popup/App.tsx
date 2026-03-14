import { useEffect, useState } from 'react';
import type { Recipe } from '../../utils/extractRecipe';

type State =
  | { status: 'loading' }
  | { status: 'done'; recipe: Recipe }
  | { status: 'error'; message: string };

function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    console.log('[kaiCook] Popup mounted, requesting tab URL…');

    browser.runtime.sendMessage({ type: 'GET_TAB_URL' })
      .then((urlResponse) => {
        const url = urlResponse?.url ?? null;
        console.log('[kaiCook] Tab URL received:', url);

        if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
          console.warn('[kaiCook] Unsupported URL, skipping extraction:', url);
          return;
        }

        console.log('[kaiCook] Sending EXTRACT_RECIPE to background…');
        return browser.runtime.sendMessage({ type: 'EXTRACT_RECIPE' });
      })
      .then((recipeResponse) => {
        if (!recipeResponse) return; // early-exit branch (no URL) already set error state
        console.log('[kaiCook] EXTRACT_RECIPE response:', recipeResponse);

        if (recipeResponse.error) {
          console.error('[kaiCook] Extraction error:', recipeResponse.error);
          setState({ status: 'error', message: recipeResponse.error });
        } else {
          console.log('[kaiCook] Recipe extracted successfully:', recipeResponse.recipe);
          setState({ status: 'done', recipe: recipeResponse.recipe });
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[kaiCook] Unexpected error in popup:', message, err);
        setState({ status: 'error', message });
      });
  }, []);

  return (
    <div style={{ padding: '1rem', width: '340px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>kaiCook</h2>

      {state.status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="w-6 h-6 rounded-full border-2 border-gray-600 border-t-white animate-spin" />
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>Extracting recipe…</p>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-gray-800" style={{ fontSize: '0.85rem' }}>{state.message}</p>
      )}

      {state.status === 'done' && (
        <div>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: '#888', letterSpacing: '0.04em' }}>
            ✓ Recipe opened in tab
          </p>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>{state.recipe.title}</p>
        </div>
      )}
    </div>
  );
}

export default App;
