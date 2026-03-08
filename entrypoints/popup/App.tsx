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
          setState({ status: 'error', message: 'Please navigate to a recipe page first.' });
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
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Extracting recipe…</p>
      )}

      {state.status === 'error' && (
        <p style={{ color: '#c00', fontSize: '0.85rem' }}>{state.message}</p>
      )}

      {state.status === 'done' && (
        <div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#888', letterSpacing: '0.04em' }}>
            ✓ Recipe opened in tab
          </p>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>{state.recipe.title}</h3>

          {state.recipe.description && (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#555' }}>
              {state.recipe.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#666' }}>
            {state.recipe.servings > 0 && <span>Serves {state.recipe.servings}</span>}
            {state.recipe.totalTime && <span>{state.recipe.totalTime}</span>}
          </div>

          <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ingredients
          </h4>
          <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
            {state.recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity > 0 && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
                {ing.name}
              </li>
            ))}
          </ul>

          <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Steps
          </h4>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
            {state.recipe.steps.map((step, i) => (
              <li key={i} style={{ marginBottom: '0.35rem' }}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default App;
