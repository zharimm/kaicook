import { useEffect, useState } from 'react';
import type { Recipe } from '../../utils/extractRecipe';

// ─── SVG icons ────────────────────────────────────────────────────────────────
const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtQty(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

// ─── Types ────────────────────────────────────────────────────────────────────
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recipe: Recipe; sourceUrl: string };

// ─── Component ────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [servings, setServings] = useState(1);
  const [baseServings, setBaseServings] = useState(1);
  const [copied, setCopied] = useState(false);

  // Sync dark class to <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Read recipe + source URL from session storage
  useEffect(() => {
    browser.storage.session.get(['recipe', 'recipeSourceUrl']).then((result) => {
      const recipe = result?.recipe as Recipe | undefined;
      if (!recipe) {
        setState({ status: 'error', message: 'No recipe found. Open a recipe page and click the extension icon.' });
        return;
      }
      const base = recipe.servings > 0 ? recipe.servings : 1;
      setBaseServings(base);
      setServings(base);
      document.title = `${recipe.title} — kaiCook`;
      setState({ status: 'ready', recipe, sourceUrl: (result.recipeSourceUrl as string) ?? '' });
    }).catch((err: unknown) => {
      setState({ status: 'error', message: String(err) });
    });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg)' }}>
        <p className="text-sm text-center" style={{ color: 'var(--muted)', maxWidth: 400 }}>{state.message}</p>
      </div>
    );
  }

  const { recipe, sourceUrl } = state;
  const scale = servings / baseServings;

  function copyRecipe() {
    const lines = [
      recipe.title,
      '',
      'INGREDIENTS:',
      ...recipe.ingredients.map((ing) => {
        const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
        const qty = scaled > 0 ? `${fmtQty(scaled)} ` : '';
        const unit = ing.unit ? `${ing.unit} ` : '';
        return `• ${qty}${unit}${ing.name}`;
      }),
      '',
      'STEPS:',
      ...recipe.steps.map((step, i) => `${i + 1}. ${step}`),
      ...(sourceUrl ? ['', `Source: ${sourceUrl}`] : []),
    ].join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Shared button style helpers (avoid repeating inline style objects)
  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--muted)', padding: '0.4rem', borderRadius: 6, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };
  const stepBtnStyle: React.CSSProperties = {
    background: 'var(--muted-bg)', border: 'none', cursor: 'pointer',
    color: 'var(--fg)', borderRadius: 4, width: '1.5rem', height: '1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem', lineHeight: 1,
  };
  const accentDot = (
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
  );

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <div className="max-w-4xl mx-auto px-6" style={{ paddingTop: '2.5rem', paddingBottom: '5rem' }}>

        {/* ── Topbar ── */}
        <div className="flex justify-between items-center mb-8 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            kaiCook
          </span>
          <button style={iconBtnStyle} onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {/* ── Title + Copy ── */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl font-bold tracking-tight" style={{ lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {recipe.title}
          </h1>
          <button
            onClick={copyRecipe}
            className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg shrink-0"
            style={{ background: 'var(--muted-bg)', color: 'var(--fg)', border: 'none', cursor: 'pointer' }}
          >
            {copied ? '✓' : <CopyIcon />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {recipe.description && (
          <p className="text-base leading-relaxed mb-6" style={{ color: 'var(--muted)', maxWidth: 640 }}>
            {recipe.description}
          </p>
        )}

        {/* ── Meta cards ── */}
        {(recipe.totalTime || recipe.servings > 0) && (
          <div className="flex flex-wrap gap-3 mb-8">
            {recipe.totalTime && (
              <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
                <span style={{ color: 'var(--muted)', display: 'flex' }}><ClockIcon /></span>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Total time</p>
                  <p className="text-sm font-semibold">{recipe.totalTime}</p>
                </div>
              </div>
            )}
            {recipe.servings > 0 && (
              <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
                <span style={{ color: 'var(--muted)', display: 'flex' }}><UsersIcon /></span>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Serves</p>
                  <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                    <button
                      style={{ ...stepBtnStyle, opacity: servings <= 1 ? 0.3 : 1, cursor: servings <= 1 ? 'default' : 'pointer' }}
                      onClick={() => setServings((s) => Math.max(1, s - 1))}
                      disabled={servings <= 1}
                      aria-label="Decrease servings"
                    >−</button>
                    <span className="text-sm font-semibold" style={{ minWidth: '1.25rem', textAlign: 'center' }}>{servings}</span>
                    <button
                      style={stepBtnStyle}
                      onClick={() => setServings((s) => s + 1)}
                      aria-label="Increase servings"
                    >+</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />

        {/* ── Ingredients + Steps ── */}
        <div className="recipe-sections">

          {/* Ingredients */}
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
              {accentDot}Ingredients
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {recipe.ingredients.map((ing, i) => {
                const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
                const qty = scaled > 0 ? <strong>{fmtQty(scaled)} </strong> : null;
                const unit = ing.unit ? `${ing.unit} ` : '';
                return (
                  <li key={i} className="flex items-start gap-3 rounded-lg text-sm"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.6rem 0.75rem', lineHeight: 1.45 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)', opacity: 0.5, flexShrink: 0, marginTop: '0.35rem', display: 'block' }} />
                    <span>{qty}{unit}{ing.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Steps */}
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
              {accentDot}Steps
            </p>
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="flex items-center justify-center shrink-0 text-xs font-bold rounded-full"
                    style={{ width: '2rem', height: '2rem', background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                    {i + 1}
                  </span>
                  <p style={{ paddingTop: '0.3rem', fontSize: '0.9375rem', lineHeight: 1.65 }}>{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ── Source ── */}
        {sourceUrl && (
          <div className="mt-10 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: 'var(--muted)', textDecoration: 'none' }}
            >
              <ExternalLinkIcon />
              View original recipe
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
