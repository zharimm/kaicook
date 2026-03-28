import { useEffect, useRef, useState } from 'react';
import type { Ingredient, Recipe, SwappableIngredient, Substitute } from '../../utils/extractRecipe';
import { getStaticSwaps } from '../../utils/staticSwaps';
import { cleanIngredientLabels } from '../../utils/cleanLabels';

// ─── Remix icon helper ────────────────────────────────────────────────────────
const Ri = ({ name, size = 16 }: { name: string; size?: number }) => (
  <i className={name} style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', userSelect: 'none' }} />
);

// ─── Time formatting (handles ISO 8601 durations like PT1H30M) ──────────────
function formatTime(raw: string): string {
  // Handles PT1H30M, P0DT0H30M, PT45M, etc.
  const match = raw.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return raw;
  const d = match[1] && match[1] !== '0' ? `${match[1]}d` : '';
  const h = match[2] && match[2] !== '0' ? `${match[2]}h` : '';
  const m = match[3] && match[3] !== '0' ? `${match[3]}m` : '';
  return [d, h, m].filter(Boolean).join(' ') || raw;
}

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

// ─── Swap type colors ────────────────────────────────────────────────────────
function swapTypeBadge(type: Substitute['type']): { label: string; color: string } {
  switch (type) {
    case 'safe': return { label: 'Safe swap', color: 'var(--badge-safe)' };
    case 'ratio_change': return { label: 'Ratio change', color: 'var(--badge-ratio)' };
    case 'flavour_change': return { label: 'Flavour change', color: 'var(--badge-flavour)' };
    case 'dietary': return { label: 'Dietary', color: 'var(--badge-dietary)' };
    case 'availability': return { label: 'Availability', color: 'var(--badge-availability)' };
    default: return { label: type, color: 'var(--muted)' };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recipe: Recipe; sourceUrl: string };

interface ActiveSwap {
  originalName: string;
  swappedTo: string;
  note: string;
  type: Substitute['type'];
  quantityMultiplier: number | null;
  /** Step indices that were rewritten by AI (used for revert) */
  modifiedSteps?: { index: number; originalText: string }[];
}

type EnrichPhase = 'idle' | 'cleaning' | 'polishing' | 'done';

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

  // AI Assistant toggle and enrichment phases
  const [aiEnabled, setAiEnabled] = useState(false);
  const [enrichPhase, setEnrichPhase] = useState<EnrichPhase>('idle');

  // Swap state
  const [ingredientNames, setIngredientNames] = useState<string[]>([]);
  const [stepTexts, setStepTexts] = useState<string[]>([]);
  const [activeSwapIdx, setActiveSwapIdx] = useState<number | null>(null);
  const [stepNotes, setStepNotes] = useState<Record<number, { ingIdx: number; name: string; note: string; type: Substitute['type'] }[]>>({});
  const [activeSwaps, setActiveSwaps] = useState<Record<number, ActiveSwap>>({});
  const [swapLoading, setSwapLoading] = useState<number | null>(null);
  const [swapsEnriching, setSwapsEnriching] = useState(false);
  const [preferredSwaps, setPreferredSwaps] = useState<Record<string, string>>({});

  // Sync dark class to <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Load preferred swaps from storage
  useEffect(() => {
    browser.storage.local.get('preferredSwaps').then((result) => {
      if (result.preferredSwaps) setPreferredSwaps(result.preferredSwaps as Record<string, string>);
    });
  }, []);

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
      const parsed = typeof recipe.servings === 'string' ? parseInt(recipe.servings, 10) : recipe.servings;
      const base = parsed > 0 ? parsed : 1;
      console.log('[kaiCook] Recipe servings:', recipe.servings, '→ base:', base);
      setBaseServings(base);
      setServings(base);
      setServingsDraft(String(base));
      setChecked(recipe.ingredients.map(() => true));

      // Phase 1: Clean labels locally (instant), then display
      setEnrichPhase('cleaning');
      const cleaned = cleanIngredientLabels(recipe.ingredients);
      const cleanedRecipe: Recipe = { ...recipe, ingredients: cleaned };

      setIngredientNames(cleaned.map(i => i.name));
      setStepTexts(cleanedRecipe.steps);
      document.title = `${cleanedRecipe.title} — kaiCook`;
      setState({ status: 'ready', recipe: cleanedRecipe, sourceUrl: (sessionResult.recipeSourceUrl as string) ?? '' });

      const savedSystem = localResult?.unitSystem as UnitSystem | undefined;
      if (savedSystem === 'imperial' || savedSystem === 'metric') {
        setUnitSystem(savedSystem);
      }
    }).catch((err: unknown) => {
      setState({ status: 'error', message: String(err) });
    });
  }, []);

  // Phase 2: Apply static swaps immediately (non-interactive until AI enabled)
  useEffect(() => {
    if (state.status !== 'ready') return;
    const recipe = state.recipe;

    if (!recipe.swappableIngredients?.length) {
      const staticSwaps = getStaticSwaps(recipe.ingredients);
      if (staticSwaps.length) {
        setState(prev => {
          if (prev.status !== 'ready') return prev;
          return { ...prev, recipe: { ...prev.recipe, swappableIngredients: staticSwaps } };
        });
        console.log('[kaiCook] Static swaps applied:', staticSwaps.length, 'ingredients');
      }
    }

    setEnrichPhase('idle');
  }, [state.status]);

  // Phase 3: AI Assistant toggle — only fetches swaps for ingredients without static matches
  useEffect(() => {
    if (state.status !== 'ready') return;
    const recipe = state.recipe;

    if (!aiEnabled) {
      console.log('[kaiCook] AI Assistant disabled');
      setEnrichPhase('idle');
      return;
    }

    // Build list of ingredients NOT already covered by static swaps
    const staticNames = new Set(
      (recipe.swappableIngredients ?? []).map(si => si.name.toLowerCase())
    );
    const unmatchedIngredients = recipe.ingredients
      .map((ing, i) => ({ index: i, name: ing.name }))
      .filter(ing => !staticNames.has(ing.name.toLowerCase()));

    console.log('[kaiCook] AI: sending', unmatchedIngredients.length, 'of', recipe.ingredients.length, 'ingredients (rest covered by static)');

    // If all ingredients have static swaps, skip the API call entirely
    if (unmatchedIngredients.length === 0) {
      console.log('[kaiCook] All ingredients covered by static swaps — skipping API');
      setEnrichPhase('done');
      return;
    }

    setEnrichPhase('polishing');
    setSwapsEnriching(true);

    browser.runtime.sendMessage({
      type: 'FETCH_AI_SWAPS',
      recipeTitle: recipe.title,
      ingredients: unmatchedIngredients,
    })
      .then((response: { swaps?: SwappableIngredient[]; error?: string }) => {
        if (response?.error) {
          console.log('[kaiCook] AI swap failed:', response.error);
          setEnrichPhase('done');
          return;
        }

        // Merge AI swaps with existing static swaps
        if (response?.swaps?.length) {
          setState(prev => {
            if (prev.status !== 'ready') return prev;
            const current = [...(prev.recipe.swappableIngredients ?? [])];
            const existingMap = new Map(current.map((s, i) => [s.name.toLowerCase(), i]));

            for (const apiSwap of response.swaps!) {
              const key = apiSwap.name.toLowerCase();
              if (!existingMap.has(key)) {
                current.push(apiSwap);
              }
            }

            console.log('[kaiCook] AI swaps merged: total', current.length, 'ingredients');
            return { ...prev, recipe: { ...prev.recipe, swappableIngredients: current } };
          });
        }

        setEnrichPhase('done');
      })
      .catch((err: unknown) => {
        console.log('[kaiCook] AI swap failed:', err);
        setEnrichPhase('done');
      })
      .finally(() => setSwapsEnriching(false));
  }, [aiEnabled, state.status]);

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

  // Build a lookup from ingredient name → SwappableIngredient
  // Interactive swaps only available when AI is enabled and done enriching
  const swappableMap = new Map<string, SwappableIngredient>();
  if (recipe.swappableIngredients && aiEnabled && enrichPhase === 'done') {
    for (const si of recipe.swappableIngredients) {
      swappableMap.set(si.name.toLowerCase(), si);
    }
  }

  // Pulsating pills: show when AI is on but still processing
  const pendingSwapSet = new Set<string>();
  if (recipe.swappableIngredients && aiEnabled && enrichPhase !== 'done') {
    for (const si of recipe.swappableIngredients) {
      pendingSwapSet.add(si.name.toLowerCase());
    }
  }

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
        return `• ${qty}${unit}${ingredientNames[recipe.ingredients.indexOf(ing)] ?? ing.name}`;
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
      ...recipe.ingredients.map((ing, i) => {
        const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
        const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
        const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
        const unit = dispUnit ? `${dispUnit} ` : '';
        return `• ${qty}${unit}${ingredientNames[i] ?? ing.name}`;
      }),
      '',
      'STEPS:',
      ...stepTexts.map((step, i) => `${i + 1}. ${convertStepTemp(step, unitSystem)}`),
      ...(sourceUrl ? ['', `Source: ${sourceUrl}`] : []),
    ].join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Swap helpers ──
  async function handleSwap(ingIdx: number, sub: Substitute, swappableInfo: SwappableIngredient) {
    const origName = swappableInfo.name;

    setSwapLoading(ingIdx);

    try {
      // Call Haiku for impact note
      const response = await browser.runtime.sendMessage({
        type: 'SWAP_INGREDIENT',
        ingredientName: origName,
        substituteName: sub.label,
        recipeTitle: recipe.title,
        recipeSteps: recipe.steps,
      });

      const aiNote = response?.result?.note ?? sub.note ?? '';
      const quantityMultiplier = response?.result?.quantityMultiplier ?? sub.ratioChange ?? null;
      const aiSteps: { index: number; text: string }[] = response?.result?.steps ?? [];
      const noteStepIndex: number | undefined = response?.result?.noteStepIndex;

      // Update ingredient name
      setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? sub.label : n));

      // Apply AI-normalized step texts — the AI rewrites only affected steps contextually,
      // avoiding naive issues like "powdered sugar" → "powdered honey"
      if (aiSteps.length > 0) {
        setStepTexts(prev => {
          const next = [...prev];
          for (const { index, text } of aiSteps) {
            if (index >= 0 && index < next.length) {
              next[index] = text;
            }
          }
          return next;
        });
      }

      // Attach note to the step the AI identified as most relevant (or first AI-rewritten step)
      const noteIdx = noteStepIndex ?? aiSteps[0]?.index ?? null;
      setStepNotes(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const k = parseInt(key);
          next[k] = (next[k] ?? []).filter(n => n.ingIdx !== ingIdx);
          if (next[k].length === 0) delete next[k];
        }
        if (noteIdx !== null && noteIdx !== undefined) {
          next[noteIdx] = [...(next[noteIdx] ?? []), { ingIdx, name: sub.label, note: aiNote, type: sub.type }];
        }
        return next;
      });

      // Track active swap — store which steps were modified for revert
      const modifiedSteps = aiSteps.map(({ index }) => ({
        index,
        originalText: stepTexts[index] ?? recipe.steps[index] ?? '',
      }));
      setActiveSwaps(prev => ({
        ...prev,
        [ingIdx]: { originalName: origName, swappedTo: sub.label, note: aiNote, type: sub.type, quantityMultiplier, modifiedSteps },
      }));

      // Save preferred swap
      const nextPreferred = { ...preferredSwaps, [origName]: sub.label };
      setPreferredSwaps(nextPreferred);
      browser.storage.local.set({ preferredSwaps: nextPreferred });

    } catch (err) {
      console.error('[kaiCook] Swap API call failed:', err);
      // Fallback: still apply swap with pre-existing note
      setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? sub.label : n));
      // Use word-boundary replacement (full name only)
      const fallbackTerms = [swappableInfo.name];
      setStepTexts(prev => prev.map(s => {
        for (const term of fallbackTerms) {
          const r = new RegExp('\\b' + escapeRegex(term) + '\\b', 'gi');
          if (r.test(s)) return s.replace(new RegExp('\\b' + escapeRegex(term) + '\\b', 'gi'), sub.label);
        }
        return s;
      }));
      setActiveSwaps(prev => ({
        ...prev,
        [ingIdx]: { originalName: origName, swappedTo: sub.label, note: sub.note ?? '', type: sub.type, quantityMultiplier: sub.ratioChange ?? null },
      }));
    } finally {
      setSwapLoading(null);
      setActiveSwapIdx(null);
    }
  }

  function handleRevert(ingIdx: number) {
    const swap = activeSwaps[ingIdx];
    if (!swap) return;

    setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? swap.originalName : n));

    // Revert step text: restore original text for AI-modified steps
    if (swap.modifiedSteps?.length) {
      setStepTexts(prev => {
        const next = [...prev];
        for (const { index, originalText } of swap.modifiedSteps!) {
          if (index >= 0 && index < next.length) {
            next[index] = originalText;
          }
        }
        return next;
      });
    }

    // Remove only this ingredient's notes from all steps
    setStepNotes(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const k = parseInt(key);
        next[k] = (next[k] ?? []).filter(n => n.ingIdx !== ingIdx);
        if (next[k].length === 0) delete next[k];
      }
      return next;
    });

    setActiveSwaps(prev => {
      const next = { ...prev };
      delete next[ingIdx];
      return next;
    });

    // Remove preferred swap
    const nextPreferred = { ...preferredSwaps };
    delete nextPreferred[swap.originalName];
    setPreferredSwaps(nextPreferred);
    browser.storage.local.set({ preferredSwaps: nextPreferred });

    setActiveSwapIdx(null);
  }

  function handleResetAll() {
    if (state.status !== 'ready') return;
    // Restore original ingredient names and step texts from the recipe
    setIngredientNames(state.recipe.ingredients.map(i => i.name));
    setStepTexts(state.recipe.steps);
    setActiveSwaps({});
    setStepNotes({});
    setActiveSwapIdx(null);
    setPreferredSwaps({});
    browser.storage.local.set({ preferredSwaps: {} });
  }

  const hasAnySwaps = Object.keys(activeSwaps).length > 0;

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        <div className="flex flex-wrap gap-3 mb-8">
            {recipe.totalTime && (
              <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
                <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-time-line" /></span>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Total time</p>
                  <p className="text-sm font-semibold">{formatTime(recipe.totalTime)}</p>
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
            {/* Unit toggle */}
            <div className="no-print flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
              <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-scales-line" /></span>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>Units</p>
                <div className="flex" style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 2 }}>
                  {(['imperial', 'metric'] as const).map((sys) => (
                    <button
                      key={sys}
                      onClick={() => { setUnitSystem(sys); browser.storage.local.set({ unitSystem: sys }); }}
                      style={{
                        padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: unitSystem === sys ? 'var(--primary)' : 'transparent',
                        color: unitSystem === sys ? 'var(--primary-fg)' : 'var(--muted)',
                      }}
                    >
                      {sys === 'imperial' ? 'IMP' : 'MET'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* AI Assistant toggle */}
            <div className="no-print flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
              <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-sparkling-line" /></span>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>AI Assistant</p>
                <button
                  onClick={() => setAiEnabled(prev => !prev)}
                  style={{
                    background: aiEnabled ? 'var(--accent)' : 'var(--muted-bg)',
                    color: aiEnabled ? 'white' : 'var(--fg)',
                    border: 'none', borderRadius: 4, padding: '2px 8px',
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    textTransform: 'uppercase', transition: 'all 0.2s', marginTop: 2,
                  }}
                >
                  {aiEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '2rem' }} />

        {/* ── Ingredients + Steps ── */}
        <div className="recipe-sections">

          {/* Ingredients */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)', margin: 0 }}>
                {accentDot}Ingredients
              </p>
              {enrichPhase === 'cleaning' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: '0.7rem' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, border: '1.5px solid var(--muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  Cleaning labels...
                </span>
              )}
              {enrichPhase === 'polishing' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: '0.7rem' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, border: '1.5px solid var(--muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  Polishing...
                </span>
              )}
              {hasAnySwaps && !swapsEnriching && (
                <button
                  className="no-print"
                  onClick={handleResetAll}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '1px 4px', borderRadius: 4,
                    marginLeft: 'auto',
                  }}
                >
                  <Ri name="ri-refresh-line" size={11} /> Reset swaps
                </button>
              )}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {recipe.ingredients.map((ing, i) => {
                const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
                const swap = activeSwaps[i];
                const qtyMultiplier = swap?.quantityMultiplier ?? 1;
                const adjustedQty = scaled * qtyMultiplier;
                const { quantity: dispQty, unit: dispUnit } = convertUnit(adjustedQty, ing.unit, unitSystem);
                const qty = dispQty > 0 ? <strong>{fmtQty(dispQty)} </strong> : null;
                const unit = dispUnit ? `${dispUnit} ` : '';
                const name = ingredientNames[i] ?? ing.name;
                const swappable = swappableMap.get(ing.name.toLowerCase());
                const isSwappable = !!swappable;
                const hasPendingSwap = pendingSwapSet.has(ing.name.toLowerCase());
                const hasBeenSwapped = !!activeSwaps[i];
                const isLoading = swapLoading === i;

                const pillBg = hasBeenSwapped ? 'var(--swap-active-bg)' : 'var(--swap-bg)';
                const pillColor = hasBeenSwapped ? 'var(--swap-active-fg)' : 'var(--swap-fg)';
                const pillOutline = hasBeenSwapped ? '1px solid var(--swap-outline)' : '1px solid var(--swap-outline)';

                // Pulsating pill when AI is on but still processing
                const nameEl = hasPendingSwap && !isSwappable ? (
                  <span
                    className="swap-pill-pending"
                    style={{
                      padding: '2px 5px', borderRadius: 4, display: 'inline',
                      background: 'var(--swap-bg)', color: 'var(--swap-fg)', outline: '1px solid var(--swap-outline)',
                    }}
                  >
                    {name.toLowerCase()}
                  </span>
                ) : isSwappable && swappable ? (
                  <span style={{ position: 'relative', display: 'inline' }} data-swap-popover>
                    <span
                      onClick={() => setActiveSwapIdx(activeSwapIdx === i ? null : i)}
                      className="swap-pill"
                      style={{
                        padding: '2px 5px', borderRadius: 4, cursor: 'pointer', display: 'inline',
                        background: pillBg, color: pillColor, outline: pillOutline,
                      }}
                    >
                      {isLoading ? '...' : name.toLowerCase()}
                    </span>
                    {activeSwapIdx === i && (
                      <div data-swap-popover style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 6,
                        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                        padding: '0.6rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        width: 320, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {/* Original ingredient — always first for revert */}
                          <span
                            className={!hasBeenSwapped ? '' : 'swap-chip'}
                            onClick={hasBeenSwapped ? (e) => { e.stopPropagation(); handleRevert(i); } : undefined}
                            style={{
                              padding: '2px 5px', borderRadius: 4, display: 'inline',
                              fontSize: '0.8125rem', fontWeight: 500,
                              ...(!hasBeenSwapped
                                ? { background: 'var(--muted-bg)', color: 'var(--muted)', outline: '1px solid rgba(0,0,0,0.05)', cursor: 'default' }
                                : { background: 'var(--swap-bg)', color: 'var(--swap-fg)', outline: '1px solid var(--swap-outline)', cursor: 'pointer' }
                              ),
                            }}
                          >
                            {ing.name.toLowerCase()}
                          </span>
                          {/* Substitute chips */}
                          {swappable.substitutes.map((sub) => {
                            const isCurrent = hasBeenSwapped && activeSwaps[i].swappedTo.toLowerCase() === sub.label.toLowerCase();
                            const badge = swapTypeBadge(sub.type);
                            return (
                              <span
                                key={sub.label}
                                className={isCurrent ? '' : 'swap-chip'}
                                onClick={isCurrent ? undefined : (e) => {
                                  e.stopPropagation();
                                  handleSwap(i, sub, swappable);
                                }}
                                style={{
                                  padding: '2px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                  fontSize: '0.8125rem', fontWeight: 500,
                                  ...(isCurrent
                                    ? { background: 'var(--muted-bg)', color: 'var(--muted)', outline: '1px solid rgba(0,0,0,0.05)', cursor: 'default' }
                                    : { background: 'var(--swap-bg)', color: 'var(--swap-fg)', outline: '1px solid var(--swap-outline)', cursor: 'pointer' }
                                  ),
                                }}
                              >
                                {sub.label.toLowerCase()}
                                <span style={{
                                  fontSize: '0.625rem', fontWeight: 600, color: badge.color,
                                  background: `${badge.color}15`, padding: '1px 4px', borderRadius: 3,
                                }}>
                                  {badge.label}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                        <hr style={{ margin: 0, border: 'none', borderTop: '1px solid var(--border)' }} />
                        <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: '0.3rem',
                          fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                          <Ri name="ri-information-line" size={13} />
                          Click a substitute to swap. AI will provide specific guidance.
                        </p>
                      </div>
                    )}
                  </span>
                ) : <span>{name}</span>;
                const prepNote = ing.prep;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-lg text-sm"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.6rem 0.75rem', lineHeight: 1.45, overflow: 'visible' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)', opacity: 0.5, flexShrink: 0, marginTop: '0.35rem', display: 'block' }} />
                    <span>{qty}{unit}{nameEl}{prepNote && <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>, {prepNote}</span>}</span>
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
                    <p style={{ fontSize: '18px', lineHeight: 1.65, fontFamily: "'Lora', serif" }}>
                      {convertStepTemp(step, unitSystem)}
                    </p>
                    {stepNotes[i]?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.6rem' }}>
                        {stepNotes[i].map((sn, ni) => (
                          <div key={`${i}-${ni}`} style={{
                            padding: '0.6rem 0.75rem', borderRadius: 8,
                            ...(sn.type === 'dietary'
                              ? { outline: '1px solid var(--note-dietary-outline)', background: 'var(--note-dietary-bg)', color: 'var(--note-dietary-fg)' }
                              : { outline: '1px solid var(--note-safe-outline)', background: 'var(--note-safe-bg)', color: 'var(--note-safe-fg)' }
                            ),
                            fontSize: '0.8125rem', lineHeight: 1.55,
                          }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700,
                              color: sn.type === 'dietary' ? 'var(--note-dietary-fg)' : 'var(--note-safe-fg)',
                              marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: "'Inter', sans-serif",
                            }}>
                              <Ri name="ri-sparkling-line" size={12} /> {sn.name}
                              {sn.type === 'dietary' && (
                                <span style={{
                                  marginLeft: '0.3rem', fontSize: '0.625rem', fontWeight: 600,
                                  background: 'var(--note-dietary-badge)', color: 'var(--note-dietary-fg)', padding: '1px 5px', borderRadius: 3,
                                }}>Dietary swap</span>
                              )}
                            </span>
                            <span>{sn.note}</span>
                          </div>
                        ))}
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
                  const swap = activeSwaps[i];
                  const qtyMultiplier = swap?.quantityMultiplier ?? 1;
                  const adjustedQty = scaled * qtyMultiplier;
                  const { quantity: dispQty, unit: dispUnit } = convertUnit(adjustedQty, ing.unit, unitSystem);
                  const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
                  const unit = dispUnit ? `${dispUnit} ` : '';
                  const isChecked = checked[i] ?? true;
                  const displayName = ingredientNames[i] ?? ing.name;

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
                          {qty && <strong>{qty}</strong>}{unit}{displayName}
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
