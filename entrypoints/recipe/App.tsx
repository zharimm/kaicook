import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '../../utils/extractRecipe';

// ─── Remix icon helper ────────────────────────────────────────────────────────
const Ri = ({ name, size = 16 }: { name: string; size?: number }) => (
  <i className={name} style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', userSelect: 'none' }} />
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

// ─── Sugar swaps ──────────────────────────────────────────────────────────────
const SUGAR_SWAPS = [
  { label: 'Honey', type: 'ratio_change', impact: 'Changes flavour', note: 'Use 75% of the amount and reduce other liquids by 1 tbsp. Adds a floral flavour.' },
  { label: 'Maple syrup', type: 'flavour_change', impact: 'Changes flavour', note: 'Use same quantity but expect a subtle maple flavour. Works best in bakes and sauces.' },
  { label: 'Agave nectar', type: 'ratio_change', impact: 'Adjusts recipe', note: 'Use 75% of the amount. Sweeter than sugar with a neutral taste. Reduce oven temperature by 10°C as it browns faster.' },
  { label: 'Coconut sugar', type: 'safe', impact: 'Safe swap', note: '1:1 replacement. Slightly less sweet with a caramel-like flavour.' },
];

function swapColor(type: string): string {
  if (type === 'safe') return '#16a34a';
  if (type === 'flavour_change') return '#d97706';
  return '#ea580c';
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
  const [servingsDraft, setServingsDraft] = useState<string>('1');
  const [baseServings, setBaseServings] = useState(1);
  const [copied, setCopied] = useState(false);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');

  // Grocery list state
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [listCopied, setListCopied] = useState(false);

  const didInit = useRef(false);

  // Swap state
  const [ingredientNames, setIngredientNames] = useState<string[]>([]);
  const [stepTexts, setStepTexts] = useState<string[]>([]);
  const [activeSwapIdx, setActiveSwapIdx] = useState<number | null>(null);
  const [stepNotes, setStepNotes] = useState<Record<number, { note: string; type: string }>>({});

  // Sync dark class to <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Read recipe + source URL from session storage, and unit preference from local storage
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
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
      setIngredientNames(recipe.ingredients.map(i => i.name));
      setStepTexts(recipe.steps);
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

  // Close swap popover on outside click
  useEffect(() => {
    if (activeSwapIdx === null) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-swap-popover]')) setActiveSwapIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeSwapIdx]);

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

  // ── Swap helpers ──
  function handleSwap(ingIdx: number, swap: typeof SUGAR_SWAPS[number]) {
    setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? swap.label : n));
    const nextSteps = stepTexts.map(s => s.replace(/sugar/gi, swap.label));
    setStepTexts(nextSteps);
    const notes: Record<number, { note: string; type: string }> = { ...stepNotes };
    stepTexts.forEach((s, i) => {
      if (/sugar/i.test(s)) notes[i] = { note: swap.note, type: swap.type };
    });
    setStepNotes(notes);
    setActiveSwapIdx(null);
  }

  function handleRevert(ingIdx: number, currentLabel: string, origName: string) {
    setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? origName : n));
    setStepTexts(prev => prev.map(s => s.replace(new RegExp(currentLabel, 'gi'), origName)));
    setStepNotes({});
    setActiveSwapIdx(null);
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
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh', fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>
      <div className="max-w-4xl mx-auto px-6" style={{ paddingTop: '2.5rem', paddingBottom: '5rem' }}>

        {/* ── Topbar ── */}
        <div className="no-print flex justify-between items-center mb-8 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            kaiCook
          </span>
          <button className="btn-icon" style={iconBtnStyle} onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
            {dark ? <Ri name="ri-sun-line" /> : <Ri name="ri-moon-line" />}
          </button>
        </div>

        {/* ── Title + action buttons ── */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-3xl tracking-tight" style={{ lineHeight: 1.2, letterSpacing: '-0.02em', fontFamily: "'Lora', serif", fontWeight: 400 }}>
            {recipe.title}
          </h1>
          <div className="no-print flex items-center gap-2 shrink-0">
            <button
              onClick={() => setGroceryOpen(true)}
              className="btn-action flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ background: 'var(--muted-bg)', color: 'var(--fg)', border: 'none', cursor: 'pointer' }}
            >
              <Ri name="ri-shopping-cart-line" size={15} />
              Grocery List
            </button>
            <button
              onClick={copyRecipe}
              className="btn-action flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ background: 'var(--muted-bg)', color: 'var(--fg)', border: 'none', cursor: 'pointer' }}
            >
              {copied ? <Ri name="ri-check-line" size={15} /> : <Ri name="ri-file-copy-line" size={15} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => window.print()}
              aria-label="Print recipe"
              className="btn-icon"
              style={{ ...iconBtnStyle, background: 'var(--muted-bg)', color: 'var(--fg)', padding: '0.5rem 0.6rem', borderRadius: 8 }}
            >
              <Ri name="ri-printer-line" size={15} />
            </button>
          </div>
        </div>

        {recipe.description && (
          <p className="text-base leading-relaxed mb-6" style={{ color: 'var(--fg)', maxWidth: 640 }}>
            {recipe.description}
          </p>
        )}

        {/* ── Meta cards ── */}
        {(recipe.totalTime || recipe.servings > 0) && (
          <div className="flex flex-wrap gap-3 mb-8">
            {recipe.totalTime && (
              <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
                <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-time-line" /></span>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Total time</p>
                  <p className="text-sm font-semibold">{recipe.totalTime}</p>
                </div>
              </div>
            )}
            {recipe.servings > 0 && (
              <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
                <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-group-line" /></span>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Serves</p>
                  <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
                    <button
                      className="no-print btn-step"
                      style={{ ...stepBtnStyle, opacity: servings <= 1 ? 0.3 : 1, cursor: servings <= 1 ? 'default' : 'pointer' }}
                      onClick={() => { const v = Math.max(1, servings - 1); setServings(v); setServingsDraft(String(v)); }}
                      disabled={servings <= 1}
                      aria-label="Decrease servings"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      value={servingsDraft}
                      onChange={(e) => {
                        setServingsDraft(e.target.value);
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 1) setServings(v);
                      }}
                      onBlur={() => {
                        const v = parseInt(servingsDraft, 10);
                        const clamped = (!isNaN(v) && v >= 1) ? v : 1;
                        setServings(clamped);
                        setServingsDraft(String(clamped));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      onFocus={(e) => e.target.select()}
                      className="text-sm font-semibold"
                      style={{ width: '2rem', height: '1.5rem', textAlign: 'center', background: 'transparent',
                        color: 'var(--fg)', border: 'none', outline: '1px solid rgba(0,0,0,0.12)',
                        borderRadius: 4, padding: 0, boxSizing: 'border-box' }}
                    />
                    <button
                      className="no-print btn-step"
                      style={stepBtnStyle}
                      onClick={() => { const v = servings + 1; setServings(v); setServingsDraft(String(v)); }}
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
                const name = ingredientNames[i] ?? ing.name;
                const wasOriginallySwappable = ing.name.toLowerCase().includes('sugar');
                const hasBeenSwapped = wasOriginallySwappable && !name.toLowerCase().includes('sugar');
                const isSwappable = wasOriginallySwappable;
                const nameEl = isSwappable ? (
                  <span style={{ position: 'relative', display: 'inline' }} data-swap-popover>
                    <span
                      onClick={() => setActiveSwapIdx(activeSwapIdx === i ? null : i)}
                      className="swap-pill"
                      style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', display: 'inline', background: '#dcfce7', color: '#166534', outline: '1px solid rgba(22, 101, 52, 0.05)' }}
                    >
                      {name.toLowerCase()}
                    </span>
                    {activeSwapIdx === i && (
                      <div data-swap-popover style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 6,
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                        padding: '0.6rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        width: 300, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {[ing.name, ...SUGAR_SWAPS.map(s => s.label)].map(label => {
                            const isCurrent = label.toLowerCase() === name.toLowerCase();
                            const isOriginal = label === ing.name;
                            return (
                              <span
                                key={label}
                                className={isCurrent ? '' : 'swap-chip'}
                                onClick={isCurrent ? undefined : (e) => {
                                  e.stopPropagation();
                                  if (isOriginal) handleRevert(i, name, ing.name);
                                  else handleSwap(i, SUGAR_SWAPS.find(s => s.label === label)!);
                                }}
                                style={{ padding: '2px 5px', borderRadius: 4, display: 'inline',
                                  fontSize: '0.8125rem', fontWeight: 500,
                                  ...(isCurrent
                                    ? { background: 'var(--muted-bg)', color: 'var(--muted)', outline: '1px solid rgba(0,0,0,0.05)', cursor: 'default' }
                                    : { background: '#dcfce7', color: '#166534', outline: '1px solid rgba(22, 101, 52, 0.05)', cursor: 'pointer' }
                                  )}}
                              >
                                {label.toLowerCase()}
                              </span>
                            );
                          })}
                        </div>
                        <hr style={{ margin: 0, border: 'none', borderTop: '1px solid var(--border)' }} />
                        <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: '0.3rem',
                          fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                          <Ri name="ri-information-line" size={13} />
                          Some swaps may change the ratio or flavour of your recipe.
                        </p>
                      </div>
                    )}
                  </span>
                ) : <span>{name}</span>;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-lg text-sm"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.6rem 0.75rem', lineHeight: 1.45, overflow: 'visible' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)', opacity: 0.5, flexShrink: 0, marginTop: '0.35rem', display: 'block' }} />
                    <span>{qty}{unit}{nameEl}</span>
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
              {(stepTexts.length ? stepTexts : recipe.steps).map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="flex items-center justify-center shrink-0 text-xs font-bold rounded-full"
                    style={{ width: '2rem', height: '2rem', background: 'var(--primary)', color: 'var(--primary-fg)' }}>
                    {i + 1}
                  </span>
                  <div className="flex flex-col" style={{ paddingTop: '0.3rem', flex: 1 }}>
                    <p style={{ fontSize: '18px', lineHeight: 1.65, fontFamily: "'Lora', serif" }}>{convertStepTemp(step, unitSystem)}</p>
                    {stepNotes[i] && (
                      <div style={{
                        marginTop: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 8,
                        outline: '1px solid rgba(22, 101, 52, 0.05)', background: '#dcfce7', color: '#166534',
                        fontSize: '0.8125rem', lineHeight: 1.55,
                      }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: '#166534',
                          marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: "'Inter', sans-serif",
                        }}><Ri name="ri-sparkling-line" size={12} /> AI note</span>
                        <span>{stepNotes[i].note}</span>
                      </div>
                    )}
                  </div>
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
              className="source-link inline-flex items-center gap-2 text-sm"
              style={{ color: 'var(--muted)', textDecoration: 'none' }}
            >
              <Ri name="ri-external-link-line" size={14} />
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
                  className="btn-text"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500, padding: 0 }}
                >
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
                <button className="btn-icon" style={iconBtnStyle} onClick={() => setGroceryOpen(false)} aria-label="Close grocery list">
                  <Ri name="ri-close-line" />
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
                      <label className="grocery-label" style={{
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
                className="btn-primary"
                onClick={copyGroceryList}
                style={{
                  width: '100%', padding: '0.65rem', borderRadius: 8,
                  background: 'var(--primary)', color: 'var(--primary-fg)',
                  border: 'none', cursor: 'pointer',
                  fontSize: '0.875rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                {listCopied ? <><Ri name="ri-check-line" size={15} /> Copied!</> : <><Ri name="ri-file-copy-line" size={15} /> Copy list</>}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
