import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../../utils/extractRecipe';

type UnitSystem = 'imperial' | 'metric';

type State =
  | { status: 'loading' }
  | { status: 'kaicook' }              // easter egg flash
  | { status: 'settings' }             // idle — no active recipe
  | { status: 'done'; recipe: Recipe }
  | { status: 'error'; message: string };

function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const didExtract = useRef(false);

  // Load saved unit preference on mount
  useEffect(() => {
    browser.storage.local.get('unitSystem').then((result) => {
      const saved = result?.unitSystem as UnitSystem | undefined;
      if (saved === 'imperial' || saved === 'metric') setUnitSystem(saved);
    });
  }, []);

  useEffect(() => {
    if (didExtract.current) return;
    didExtract.current = true;
    console.log('[kaiCook] Popup mounted, requesting tab URL…');

    browser.runtime.sendMessage({ type: 'GET_TAB_URL' })
      .then((urlResponse) => {
        const url = urlResponse?.url ?? null;
        console.log('[kaiCook] Tab URL received:', url);

        // Background detected a chrome-extension:// tab — show easter egg then settings
        if (urlResponse?.kaicook) {
          setState({ status: 'kaicook' });
          setTimeout(() => setState({ status: 'settings' }), 1000);
          return;
        }

        if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
          console.log('[kaiCook] Unsupported URL, skipping extraction:', url);
          return;
        }

        console.log('[kaiCook] Sending EXTRACT_RECIPE to background…');
        return browser.runtime.sendMessage({ type: 'EXTRACT_RECIPE' });
      })
      .then((recipeResponse) => {
        if (!recipeResponse) return;
        console.log('[kaiCook] EXTRACT_RECIPE response:', recipeResponse);

        if (recipeResponse.error) {
          console.log('[kaiCook] Extraction error:', recipeResponse.error);
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

  function handleUnitToggle(system: UnitSystem) {
    setUnitSystem(system);
    browser.storage.local.set({ unitSystem: system });
  }

  const segmentBase: React.CSSProperties = {
    flex: 1, padding: '0.3rem 0', fontSize: '0.72rem', border: 'none',
    cursor: 'pointer', fontWeight: 500,
  };

  const settingsPanel = (
    <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid #e0e0e0' }}>
      <p style={{ fontSize: '0.68rem', color: '#888', margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Units
      </p>
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d0d0d0' }}>
        {(['imperial', 'metric'] as const).map((sys) => (
          <button
            key={sys}
            onClick={() => handleUnitToggle(sys)}
            style={{
              ...segmentBase,
              background: unitSystem === sys ? '#1a1a1a' : 'transparent',
              color: unitSystem === sys ? '#fff' : '#555',
            }}
          >
            {sys === 'imperial' ? 'Imperial' : 'Metric'}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1rem', width: '340px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>kaiCook</h2>

      {state.status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="w-6 h-6 rounded-full border-2 border-gray-600 border-t-white animate-spin" />
          <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>Extracting recipe…</p>
        </div>
      )}

      {state.status === 'kaicook' && (
        <p style={{ fontSize: '0.95rem', margin: 0, fontWeight: 500 }}>Happy cooking! 🍳</p>
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

      {settingsPanel}
    </div>
  );
}

export default App;
