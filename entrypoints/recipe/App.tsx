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
const ShoppingCartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const PrinterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

// ─── Unit conversion ───────────────────────────────────────────────────────────
type UnitSystem = 'imperial' | 'metric';

const UNIT_CONVERSIONS: Record<string, { factor: number; metricUnit: string }> = {
  cup:  { factor: 240,  metricUnit: 'ml' },
  cups: { factor: 240,  metricUnit: 'ml' },
  oz:   { factor: 28,   metricUnit: 'g'  },
  lb:   { factor: 0.45, metricUnit: 'kg' },
  lbs:  { factor: 0.45, metricUnit: 'kg' },
  tsp:  { factor: 5,    metricUnit: 'ml' },
  tbsp: { factor: 15,   metricUnit: 'ml' },
};

function convertUnit(quantity: number, unit: string, system: UnitSystem): { quantity: number; unit: string } {
  if (system === 'imperial') return { quantity, unit };
  const conv = UNIT_CONVERSIONS[unit.toLowerCase()];
  if (!conv) return { quantity, unit };
  return { quantity: quantity * conv.factor, unit: conv.metricUnit };
}

function convertStepTemp(step: string, system: UnitSystem): string {
  if (system === 'imperial') return step;
  return step.replace(/(\d+(?:\.\d+)?)\s*°?\s*F\b/g, (_, f) => {
    const c = Math.round((parseFloat(f) - 32) * 5 / 9);
    return `${c}°C`;
  });
}

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
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');

  // Grocery list state
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [listCopied, setListCopied] = useState(false);

  // Sync dark class to <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Read recipe + source URL from session storage, and unit preference from local storage
  useEffect(() => {
    Promise.all([
      browser.storage.session.get(['recipe', 'recipeSourceUrl']),
      browser.storage.local.get('unitSystem'),
    ]).then(([sessionResult, localResult]) => {
      const recipe = sessionResult?.recipe as Recipe | undefined;
      if (!recipe) {
        setState({ status: 'error', message: 'No recipe found. Open a recipe page and click the extension icon.' });
        return;
      }
      const base = recipe.servings > 0 ? recipe.servings : 1;
      setBaseServings(base);
      setServings(base);
      setChecked(recipe.ingredients.map(() => true));
      document.title = `${recipe.title} — kaiCook`;
      setState({ status: 'ready', recipe, sourceUrl: (sessionResult.recipeSourceUrl as string) ?? '' });

      const savedSystem = localResult?.unitSystem as UnitSystem | undefined;
      if (savedSystem === 'imperial' || savedSystem === 'metric') {
        setUnitSystem(savedSystem);
      }
    }).catch((err: unknown) => {
      setState({ status: 'error', message: String(err) });
    });
  }, []);

  // Listen for unit preference changes from the popup
  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.unitSystem) {
        const next = changes.unitSystem.newValue as UnitSystem;
        if (next === 'imperial' || next === 'metric') setUnitSystem(next);
      }
    };
    browser.storage.local.onChanged.addListener(handler);
    return () => browser.storage.local.onChanged.removeListener(handler);
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

  // ── Grocery list helpers ──
  const allChecked = checked.length > 0 && checked.every(Boolean);

  function toggleAll() {
    setChecked((prev) => prev.map(() => !allChecked));
  }

  function toggleItem(i: number) {
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }

  function copyGroceryList() {
    const lines = recipe.ingredients
      .filter((_, i) => checked[i])
      .map((ing) => {
        const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
        const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
        const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
        const unit = dispUnit ? `${dispUnit} ` : '';
        return `• ${qty}${unit}${ing.name}`;
      });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setListCopied(true);
      setTimeout(() => setListCopied(false), 2000);
    });
  }

  // ── Recipe copy ──
  function copyRecipe() {
    const lines = [
      recipe.title,
      '',
      'INGREDIENTS:',
      ...recipe.ingredients.map((ing) => {
        const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
        const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
        const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
        const unit = dispUnit ? `${dispUnit} ` : '';
        return `• ${qty}${unit}${ing.name}`;
      }),
      '',
      'STEPS:',
      ...recipe.steps.map((step, i) => `${i + 1}. ${convertStepTemp(step, unitSystem)}`),
      ...(sourceUrl ? ['', `Source: ${sourceUrl}`] : []),
    ].join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Shared style helpers ──
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
        <div className="no-print flex justify-between items-center mb-8 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            kaiCook
          </span>
          <button style={iconBtnStyle} onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {/* ── Title + action buttons ── */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl font-bold tracking-tight" style={{ lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {recipe.title}
          </h1>
          <div className="no-print flex items-center gap-2 shrink-0">
            <button
              onClick={() => setGroceryOpen(true)}
              className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ background: 'var(--muted-bg)', color: 'var(--fg)', border: 'none', cursor: 'pointer' }}
            >
              <ShoppingCartIcon />
              Grocery List
            </button>
            <button
              onClick={copyRecipe}
              className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ background: 'var(--muted-bg)', color: 'var(--fg)', border: 'none', cursor: 'pointer' }}
            >
              {copied ? '✓' : <CopyIcon />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => window.print()}
              aria-label="Print recipe"
              style={{ ...iconBtnStyle, background: 'var(--muted-bg)', padding: '0.5rem 0.6rem', borderRadius: 8 }}
            >
              <PrinterIcon />
            </button>
          </div>
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
                      className="no-print"
                      style={{ ...stepBtnStyle, opacity: servings <= 1 ? 0.3 : 1, cursor: servings <= 1 ? 'default' : 'pointer' }}
                      onClick={() => setServings((s) => Math.max(1, s - 1))}
                      disabled={servings <= 1}
                      aria-label="Decrease servings"
                    >−</button>
                    <span className="text-sm font-semibold" style={{ minWidth: '1.25rem', textAlign: 'center' }}>{servings}</span>
                    <button
                      className="no-print"
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
                const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
                const qty = dispQty > 0 ? <strong>{fmtQty(dispQty)} </strong> : null;
                const unit = dispUnit ? `${dispUnit} ` : '';
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
                  <p style={{ paddingTop: '0.3rem', fontSize: '0.9375rem', lineHeight: 1.65 }}>{convertStepTemp(step, unitSystem)}</p>
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

      {/* ── Grocery List panel ── */}
      {groceryOpen && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setGroceryOpen(false)}
          />

          {/* Drawer */}
          <div style={{
            position: 'relative', width: 380, maxWidth: '100vw',
            background: 'var(--bg)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', height: '100%',
          }}>

            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.25rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>Grocery List</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  onClick={toggleAll}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500, padding: 0 }}
                >
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
                <button style={iconBtnStyle} onClick={() => setGroceryOpen(false)} aria-label="Close grocery list">
                  <XIcon />
                </button>
              </div>
            </div>

            {/* Ingredient checklist */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {recipe.ingredients.map((ing, i) => {
                  const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
                  const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
                  const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
                  const unit = dispUnit ? `${dispUnit} ` : '';
                  const isChecked = checked[i] ?? true;

                  return (
                    <li key={i}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.6rem 0.5rem', borderRadius: 8, cursor: 'pointer',
                        opacity: isChecked ? 1 : 0.4,
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(i)}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
                        />
                        <span style={{
                          fontSize: '0.9rem', lineHeight: 1.45,
                          textDecoration: isChecked ? 'none' : 'line-through',
                        }}>
                          {qty && <strong>{qty}</strong>}{unit}{ing.name}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Panel footer */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={copyGroceryList}
                style={{
                  width: '100%', padding: '0.65rem', borderRadius: 8,
                  background: 'var(--primary)', color: 'var(--primary-fg)',
                  border: 'none', cursor: 'pointer',
                  fontSize: '0.875rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                {listCopied ? '✓ Copied!' : <><CopyIcon /> Copy list</>}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
