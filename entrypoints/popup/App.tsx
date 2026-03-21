import { useEffect, useRef, useState } from 'react';

type State =
  | { status: 'loading' }
  | { status: 'kaicook' }              // easter egg flash
  | { status: 'done' }
  | { status: 'error'; message: string };

function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const didExtract = useRef(false);

  useEffect(() => {
    if (didExtract.current) return;
    didExtract.current = true;

    browser.runtime.sendMessage({ type: 'GET_TAB_URL' })
      .then((urlResponse) => {
        const url = urlResponse?.url ?? null;

        if (urlResponse?.kaicook) {
          setState({ status: 'kaicook' });
          return;
        }

        if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
          setState({ status: 'error', message: 'Open a recipe page first, then click kaiCook.' });
          return;
        }

        return browser.runtime.sendMessage({ type: 'EXTRACT_RECIPE' });
      })
      .then((recipeResponse) => {
        if (!recipeResponse) return;
        if (recipeResponse.error) {
          setState({ status: 'error', message: recipeResponse.error });
        } else {
          setState({ status: 'done' });
          // Auto-close popup after opening recipe tab
          setTimeout(() => window.close(), 400);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message });
      });
  }, []);

  return (
    <div style={{ padding: '1rem', width: '300px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>kaiCook</h2>

      {state.status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid #ccc', borderTopColor: '#333',
            animation: 'spin 0.6s linear infinite',
          }} />
          <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>Opening recipe…</p>
        </div>
      )}

      {state.status === 'kaicook' && (
        <p style={{ fontSize: '0.95rem', margin: 0, fontWeight: 500 }}>Happy cooking! 🍳</p>
      )}

      {state.status === 'error' && (
        <p style={{ fontSize: '0.85rem', color: '#555', margin: 0, lineHeight: 1.5 }}>{state.message}</p>
      )}

      {state.status === 'done' && (
        <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>✓ Recipe opened</p>
      )}
    </div>
  );
}

export default App;
