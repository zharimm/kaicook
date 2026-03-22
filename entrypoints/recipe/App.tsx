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
    case 'safe': return { label: 'Safe swap', color: '#16a34a' };
    case 'ratio_change': return { label: 'Ratio change', color: '#ea580c' };
    case 'flavour_change': return { label: 'Flavour change', color: '#d97706' };
    case 'dietary': return { label: 'Dietary', color: '#c2410c' };
    case 'availability': return { label: 'Availability', color: '#6366f1' };
    default: return { label: type, color: '#6b7280' };
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
}

interface PerfData {
  t0?: number;
  t1?: number;
  t2?: number;
  t3?: number;
  t4?: number;
  t5?: number;
  t6?: number;
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
  const perfRef = useRef<PerfData>({});
  const [perfOpen, setPerfOpen] = useState(false);

  // Swap state
  const [ingredientNames, setIngredientNames] = useState<string[]>([]);
  const [stepTexts, setStepTexts] = useState<string[]>([]);
  const [activeSwapIdx, setActiveSwapIdx] = useState<number | null>(null);
  const [stepNotes, setStepNotes] = useState<Record<number, { ingIdx: number; name: string; note: string; type: Substitute['type'] }[]>>({});
  const [activeSwaps, setActiveSwaps] = useState<Record<number, ActiveSwap>>({});
  const [swapLoading, setSwapLoading] = useState<number | null>(null);
  const [swapsEnriching, setSwapsEnriching] = useState(false);
  const [preferredSwaps, setPreferredSwaps] = useState<Record<string, string>>({});

  // AI Assistant toggle and enrichment phases
  const [aiEnabled, setAiEnabled] = useState(false);
  const [enrichPhase, setEnrichPhase] = useState<EnrichPhase>('idle');

  // Sync dark class to <html> so CSS variables flip
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Load preferred swaps and AI toggle from storage
  useEffect(() => {
    Promise.all([
      browser.storage.local.get('preferredSwaps'),
      browser.storage.local.get('aiAssistant'),
    ]).then(([psResult, aiResult]) => {
      if (psResult.preferredSwaps) setPreferredSwaps(psResult.preferredSwaps as Record<string, string>);
      if (aiResult.aiAssistant !== undefined) setAiEnabled(aiResult.aiAssistant as boolean);
    });
  }, []);

  // Read recipe + source URL from session storage, and unit preference from local storage
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    perfRef.current.t0 = performance.now();

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

      // Phase 1: Immediately show recipe with cleaned labels
      const cleaned = cleanIngredientLabels(recipe.ingredients);
      setIngredientNames(cleaned.map(i => i.name));
      setStepTexts(recipe.steps);
      document.title = `${recipe.title} — kaiCook`;

      perfRef.current.t1 = performance.now();
      setEnrichPhase('cleaning');

      // Update recipe with cleaned ingredients
      const cleanedRecipe: Recipe = { ...recipe, ingredients: cleaned };
      setState({ status: 'ready', recipe: cleanedRecipe, sourceUrl: (sessionResult.recipeSourceUrl as string) ?? '' });

      const savedSystem = localResult?.unitSystem as UnitSystem | undefined;
      if (savedSystem === 'imperial' || savedSystem === 'metric') {
        setUnitSystem(savedSystem);
      }

      // Record cleaned phase completion
      perfRef.current.t3 = performance.now();
    }).catch((err: unknown) => {
      setState({ status: 'error', message: String(err) });
    });
  }, []);

  // Phase 2: Apply static swaps immediately (non-interactive)
  useEffect(() => {
    if (state.status !== 'ready') return;
    const recipe = state.recipe;

    // Apply static swaps (pulsating, non-clickable)
    if (!recipe.swappableIngredients?.length) {
      const staticSwaps = getStaticSwaps(recipe.ingredients);
      if (staticSwaps.length) {
        setState(prev => {
          if (prev.status !== 'ready') return prev;
          return { ...prev, recipe: { ...prev.recipe, swappableIngredients: staticSwaps } };
        });
        console.log('[kaiCook] Static swaps applied:', staticSwaps.length, 'ingredients');
        perfRef.current.t2 = performance.now();
      }
    }

    // Reset enrichment phase after static swaps are applied
    setEnrichPhase('idle');
  }, [state.status]);

  // Phase 3: AI Assistant toggle — triggers API call or hides swaps
  useEffect(() => {
    if (state.status !== 'ready') return;
    const recipe = state.recipe;

    if (!aiEnabled) {
      // AI is OFF: static swaps remain pulsating/non-clickable, no API call
      console.log('[kaiCook] AI Assistant disabled');
      setEnrichPhase('idle');
      return;
    }

    // AI is ON: fire the API call
    perfRef.current.t4 = performance.now();
    setEnrichPhase('polishing');
    setSwapsEnriching(true);
    perfRef.current.t5 = performance.now();

    browser.runtime.sendMessage({ type: 'FETCH_NORMALIZE_AND_SWAPS', recipe })
      .then((response: { normalizedIngredients?: Ingredient[]; swaps?: SwappableIngredient[]; error?: string }) => {
        perfRef.current.t6 = performance.now();

        if (response?.error) {
          console.warn('[kaiCook] Normalize+swap failed:', response.error);
          setEnrichPhase('done');
          return;
        }

        setState(prev => {
          if (prev.status !== 'ready') return prev;
          let updatedRecipe = { ...prev.recipe };

          // Build a map of old name → new name for re-keying swaps after normalization
          const nameChanges = new Map<string, string>();

          // Apply normalized ingredients — update names, quantities, units, prep
          if (response?.normalizedIngredients?.length) {
            updatedRecipe = {
              ...updatedRecipe,
              ingredients: updatedRecipe.ingredients.map((orig, i) => {
                const norm = response.normalizedIngredients![i];
                if (!norm) return orig;
                if (orig.name.toLowerCase() !== norm.name.toLowerCase()) {
                  nameChanges.set(orig.name.toLowerCase(), norm.name);
                }
                return { ...orig, ...norm };
              }),
            };
            // Also update the displayed ingredient names
            setIngredientNames(updatedRecipe.ingredients.map(ing => ing.name));
            console.log('[kaiCook] Ingredients normalized by AI');
          }

          // Re-key existing swappable entries to match normalized names
          if (nameChanges.size > 0 && updatedRecipe.swappableIngredients?.length) {
            updatedRecipe = {
              ...updatedRecipe,
              swappableIngredients: updatedRecipe.swappableIngredients.map(si => {
                const newName = nameChanges.get(si.name.toLowerCase());
                return newName ? { ...si, name: newName } : si;
              }),
            };
          }

          // Also re-run static swaps with normalized names to catch previously missed matches
          if (nameChanges.size > 0) {
            const freshStatic = getStaticSwaps(updatedRecipe.ingredients);
            const existing = new Set((updatedRecipe.swappableIngredients ?? []).map(s => s.name.toLowerCase()));
            const newStatic = freshStatic.filter(s => !existing.has(s.name.toLowerCase()));
            if (newStatic.length > 0) {
              updatedRecipe = {
                ...updatedRecipe,
                swappableIngredients: [...(updatedRecipe.swappableIngredients ?? []), ...newStatic],
              };
              console.log('[kaiCook] Fresh static swaps after normalization:', newStatic.length);
            }
          }

          // Apply API swaps — merge with any existing static swaps
          if (response?.swaps?.length) {
            const current = [...(updatedRecipe.swappableIngredients ?? [])];
            const existingMap = new Map(current.map((s, i) => [s.name.toLowerCase(), i]));

            for (const apiSwap of response.swaps!) {
              const key = apiSwap.name.toLowerCase();
              const idx = existingMap.get(key);
              if (idx !== undefined) {
                const existingLabels = new Set(current[idx].substitutes.map(s => s.label.toLowerCase()));
                const newSubs = apiSwap.substitutes.filter(s => !existingLabels.has(s.label.toLowerCase()));
                if (newSubs.length > 0) {
                  current[idx] = { ...current[idx], substitutes: [...current[idx].substitutes, ...newSubs] };
                }
              } else {
                current.push(apiSwap);
                existingMap.set(key, current.length - 1);
              }
            }
            updatedRecipe = { ...updatedRecipe, swappableIngredients: current };
            console.log('[kaiCook] AI swaps merged:', current.length, 'ingredients');
          }

          setEnrichPhase('done');
          return { ...prev, recipe: updatedRecipe };
        });
      })
      .catch((err: unknown) => {
        console.warn('[kaiCook] Normalize+swap failed:', err);
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

  // Setup performance widget global
  useEffect(() => {
    (window as any).__kaiPerf = perfRef.current;
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

  // Build a lookup from ingredient name → SwappableIngredient
  // Show interactive swaps only if AI is enabled AND done enriching
  const swappableMap = new Map<string, SwappableIngredient>();
  if (recipe.swappableIngredients && aiEnabled && enrichPhase === 'done') {
    for (const si of recipe.swappableIngredients) {
      swappableMap.set(si.name.toLowerCase(), si);
    }
  }

  // For static swaps display (pulsating): show if any static swaps exist
  const staticSwappableMap = new Map<string, SwappableIngredient>();
  if (recipe.swappableIngredients) {
    for (const si of recipe.swappableIngredients) {
      staticSwappableMap.set(si.name.toLowerCase(), si);
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

      // Update ingredient name
      setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? sub.label : n));

      // Build search patterns: full name + individual words (4+ chars) for compound names
      const searchTerms = [origName];
      const currentName = ingredientNames[ingIdx];
      if (currentName !== origName) searchTerms.push(currentName);
      const words = origName.split(/\s+/).filter(w => w.length >= 4);
      for (const word of words) {
        if (!searchTerms.some(t => t.toLowerCase() === word.toLowerCase())) {
          searchTerms.push(word);
        }
      }

      // Replace in steps — try each search term, use the first that matches per step
      const nextSteps = stepTexts.map(s => {
        for (const term of searchTerms) {
          const r = new RegExp(escapeRegex(term), 'gi');
          if (r.test(s)) return s.replace(r, sub.label);
        }
        return s;
      });
      setStepTexts(nextSteps);

      // Find which original steps mention this ingredient
      const affectedSteps = new Set<number>();
      recipe.steps.forEach((s, i) => {
        for (const term of searchTerms) {
          if (new RegExp(escapeRegex(term), 'gi').test(s)) {
            affectedSteps.add(i);
            break;
          }
        }
      });

      // Stack notes on affected steps
      setStepNotes(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const k = parseInt(key);
          next[k] = (next[k] ?? []).filter(n => n.ingIdx !== ingIdx);
          if (next[k].length === 0) delete next[k];
        }
        for (const i of affectedSteps) {
          next[i] = [...(next[i] ?? []), { ingIdx, name: sub.label, note: aiNote, type: sub.type }];
        }
        return next;
      });

      // Track active swap
      setActiveSwaps(prev => ({
        ...prev,
        [ingIdx]: { originalName: origName, swappedTo: sub.label, note: aiNote, type: sub.type, quantityMultiplier },
      }));

      // Save preferred swap
      const nextPreferred = { ...preferredSwaps, [origName]: sub.label };
      setPreferredSwaps(nextPreferred);
      browser.storage.local.set({ preferredSwaps: nextPreferred });

    } catch (err) {
      console.error('[kaiCook] Swap API call failed:', err);
      // Fallback: still apply swap with pre-existing note
      setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? sub.label : n));
      const fallbackTerms = [swappableInfo.name, ...swappableInfo.name.split(/\s+/).filter(w => w.length >= 4)];
      setStepTexts(prev => prev.map(s => {
        for (const term of fallbackTerms) {
          const r = new RegExp(escapeRegex(term), 'gi');
          if (r.test(s)) return s.replace(r, sub.label);
        }
        return s;
      }));
      setActiveSwaps(prev => ({
        ...prev,
        [ingIdx]: { originalName: swappableInfo.name, swappedTo: sub.label, note: sub.note ?? '', type: sub.type, quantityMultiplier: sub.ratioChange ?? null },
      }));
      const nextPreferred = { ...preferredSwaps, [swappableInfo.name]: sub.label };
      setPreferredSwaps(nextPreferred);
      browser.storage.local.set({ preferredSwaps: nextPreferred });
    } finally {
      setSwapLoading(null);
      setActiveSwapIdx(null);
    }
  }

  function handleRevert(ingIdx: number) {
    const swap = activeSwaps[ingIdx];
    if (!swap) return;

    setIngredientNames(prev => prev.map((n, i) => i === ingIdx ? swap.originalName : n));

    // Revert step text
    const origWords = swap.originalName.split(/\s+/).filter(w => w.length >= 4);
    const revertTo = recipe.steps.some(s => new RegExp(escapeRegex(swap.originalName), 'gi').test(s))
      ? swap.originalName
      : origWords.find(w => recipe.steps.some(s => new RegExp(escapeRegex(w), 'gi').test(s))) ?? swap.originalName;

    const swapRegex = new RegExp(escapeRegex(swap.swappedTo), 'gi');
    setStepTexts(prev => prev.map(s => s.replace(swapRegex, revertTo)));

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

  // Format perf data for display
  function formatPerfData(): Array<{ phase: string; time: string; delta: string }> {
    const times: Array<[string, number | undefined]> = [
      ['Load', perfRef.current.t0],
      ['Recipe displayed', perfRef.current.t1],
      ['Static swaps', perfRef.current.t2],
      ['Labels cleaned', perfRef.current.t3],
      ['AI toggled', perfRef.current.t4],
      ['API started', perfRef.current.t5],
      ['API returned', perfRef.current.t6],
    ];

    let prev: number | undefined;
    return times
      .filter(([_, t]) => t !== undefined)
      .map(([label, t]) => {
        if (!t) return { phase: label, time: '', delta: '' };
        const absTime = new Date(t).toLocaleTimeString();
        const deltaMs = prev !== undefined ? (t - prev).toFixed(0) : '0';
        prev = t;
        return { phase: label, time: absTime, delta: `+${deltaMs}ms` };
      });
  }

  const perfData = formatPerfData();
  const totalTime = perfRef.current.t6 && perfRef.current.t0 ? ((perfRef.current.t6 - perfRef.current.t0) / 1000).toFixed(2) : '';
  const apiCallTime = perfRef.current.t6 && perfRef.current.t5 ? ((perfRef.current.t6 - perfRef.current.t5) / 1000).toFixed(2) : '';

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
            <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
              <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-sparkling-line" size={16} /></span>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)', marginBottom: 2 }}>AI Assistant</p>
                <button
                  className="no-print"
                  onClick={() => {
                    const next = !aiEnabled;
                    setAiEnabled(next);
                    browser.storage.local.set({ aiAssistant: next });
                  }}
                  style={{
                    background: aiEnabled ? 'var(--accent)' : 'var(--muted-bg)',
                    color: aiEnabled ? 'white' : 'var(--fg)',
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s',
                  }}
                >
                  {aiEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '0.65rem 0.9rem' }}>
              <span style={{ color: 'var(--muted)', display: 'flex' }}><Ri name="ri-equalizer-line" size={16} /></span>
              <button
                className="no-print text-xs font-semibold"
                onClick={() => setPerfOpen(!perfOpen)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0 }}
              >
                {perfOpen ? 'Hide' : 'Perf'}
              </button>
            </div>
        </div>

        {/* ── Performance widget ── */}
        {perfOpen && (
          <div className="no-print mb-6 p-4 rounded-lg" style={{ background: 'var(--muted-bg)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            <div className="font-semibold mb-2" style={{ color: 'var(--fg)' }}>Performance Timeline</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              {perfData.map((row, i) => (
                <div key={i}>{row.phase.padEnd(20)} {row.delta}</div>
              ))}
              {totalTime && (
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', color: 'var(--fg)', fontWeight: 600 }}>
                  Total: {totalTime}s {apiCallTime && `| API: ${apiCallTime}s`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recipe sections ── */}
        <div className="recipe-sections">

          {/* ── Ingredients column ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">Ingredients</h2>
              {enrichPhase === 'cleaning' && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Cleaning labels...</span>
                </div>
              )}
              {enrichPhase === 'polishing' && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Polishing...</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recipe.ingredients.map((ing, i) => {
                const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
                const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
                const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
                const unit = dispUnit ? `${dispUnit} ` : '';

                // Check if this ingredient has a swap
                const swappable = swappableMap.get(ingredientNames[i]?.toLowerCase() ?? ing.name.toLowerCase());
                const hasSwap = i in activeSwaps;
                const swap = activeSwaps[i];

                // Check if it has a static swap (for pulsating display)
                const hasStaticSwap = staticSwappableMap.has(ingredientNames[i]?.toLowerCase() ?? ing.name.toLowerCase());

                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={checked[i] ?? true}
                      onChange={() => toggleItem(i)}
                      className="no-print"
                      style={{ marginTop: '0.35rem', cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ opacity: checked[i] ? 1 : 0.5 }}>
                        {qty}{unit}{ingredientNames[i] ?? ing.name}
                      </span>
                      {ing.prep && <span style={{ color: 'var(--muted)', fontSize: '0.85em', marginLeft: '0.25rem' }}>({ing.prep})</span>}
                      {hasSwap && swap && (
                        <div className="no-print" style={{ marginTop: '0.25rem', fontSize: '0.85em', color: 'var(--accent)' }}>
                          {accentDot} Swapped to <strong>{swap.swappedTo}</strong>
                          <button
                            onClick={() => handleRevert(i)}
                            className="btn-text"
                            style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontSize: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            (revert)
                          </button>
                        </div>
                      )}
                    </div>
                    {!hasSwap && swappable && aiEnabled && enrichPhase === 'done' && (
                      <button
                        onClick={() => setActiveSwapIdx(i)}
                        className="no-print btn-action"
                        style={{
                          background: '#16a34a', color: 'white',
                          border: 'none', borderRadius: 4, padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                          textTransform: 'uppercase', flexShrink: 0,
                        }}
                      >
                        Swap
                      </button>
                    )}
                    {!hasSwap && hasStaticSwap && !aiEnabled && (
                      <div
                        className="swap-pill-pending"
                        style={{
                          background: '#16a34a', color: 'white',
                          borderRadius: 4, padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem', fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        Swaps
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {hasAnySwaps && aiEnabled && (
              <button
                onClick={handleResetAll}
                className="no-print btn-text mt-4 text-xs"
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reset all swaps
              </button>
            )}
          </section>

          {/* ── Swap popover (modal on top of ingredient) ── */}
          {activeSwapIdx !== null && (
            <div
              data-swap-popover
              className="no-print fixed inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }}
              onClick={() => setActiveSwapIdx(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--card)', borderRadius: 8, padding: '1.5rem',
                  maxWidth: 400, width: '90%', border: '1px solid var(--border)',
                }}
              >
                <div className="mb-4">
                  <h3 className="font-semibold mb-1">Swap ingredient</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9em' }}>
                    {recipe.ingredients[activeSwapIdx]?.name}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 400, overflowY: 'auto' }}>
                  {swappableMap.get(ingredientNames[activeSwapIdx]?.toLowerCase() ?? recipe.ingredients[activeSwapIdx]?.name.toLowerCase())?.substitutes.map((sub, si) => (
                    <button
                      key={si}
                      onClick={() => handleSwap(activeSwapIdx, sub, swappableMap.get(ingredientNames[activeSwapIdx]?.toLowerCase() ?? recipe.ingredients[activeSwapIdx]?.name.toLowerCase())!)}
                      disabled={swapLoading === activeSwapIdx}
                      className="btn-action text-left no-print"
                      style={{
                        background: 'var(--muted-bg)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '0.75rem', cursor: swapLoading === activeSwapIdx ? 'default' : 'pointer',
                        opacity: swapLoading === activeSwapIdx ? 0.6 : 1,
                      }}
                    >
                      <div className="font-medium text-sm mb-1">{sub.label}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.8em', marginBottom: '0.5rem' }}>
                        <span style={{
                          display: 'inline-block', background: swapTypeBadge(sub.type).color,
                          color: 'white', padding: '0.15rem 0.5rem', borderRadius: 3,
                          fontSize: '0.7em', fontWeight: 600, marginRight: '0.5rem',
                        }}>
                          {swapTypeBadge(sub.type).label}
                        </span>
                        {sub.ratioChange && sub.ratioChange !== 1 && (
                          <span style={{ fontSize: '0.75em', color: 'var(--accent)' }}>
                            {Math.round(sub.ratioChange * 100)}%
                          </span>
                        )}
                      </div>
                      {sub.note && <div style={{ fontSize: '0.8em', color: 'var(--muted)', lineHeight: 1.4 }}>{sub.note}</div>}
                      {swapLoading === activeSwapIdx && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75em', color: 'var(--muted)' }}>
                          <div className="w-2 h-2 rounded-full border border-gray-400 border-t-transparent animate-spin" />
                          Processing...
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setActiveSwapIdx(null)}
                  className="btn-text mt-4 w-full"
                  style={{ color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '0.5rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Steps column ── */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Steps</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {stepTexts.map((step, i) => (
                <div key={i}>
                  <div className="flex gap-3">
                    <div
                      className="btn-step no-print"
                      style={{ ...stepBtnStyle, flexShrink: 0, background: 'var(--accent)', color: 'white' }}
                    >
                      {i + 1}
                    </div>
                    <p style={{ flex: 1, lineHeight: 1.6 }}>
                      {convertStepTemp(step, unitSystem)}
                    </p>
                  </div>
                  {stepNotes[i]?.map((note, ni) => (
                    <div key={ni} className="no-print" style={{ marginLeft: '2.5rem', marginTop: '0.5rem', fontSize: '0.9em', padding: '0.5rem 0.75rem', background: 'var(--muted-bg)', borderRadius: 4 }}>
                      <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.25rem' }}>
                        {accentDot} {note.name}
                      </div>
                      <div style={{ color: 'var(--muted)' }}>{note.note}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* ── Grocery list modal ── */}
        {groceryOpen && (
          <div
            className="no-print fixed inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }}
            onClick={() => setGroceryOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--card)', borderRadius: 8, padding: '1.5rem',
                maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Grocery List</h3>
                <button
                  onClick={() => setGroceryOpen(false)}
                  className="btn-icon"
                  style={iconBtnStyle}
                  aria-label="Close"
                >
                  <Ri name="ri-close-line" size={18} />
                </button>
              </div>

              <div className="mb-4 flex gap-2">
                <button
                  onClick={toggleAll}
                  className="btn-action text-xs px-2 py-1 rounded"
                  style={{ background: 'var(--muted-bg)', border: 'none', cursor: 'pointer' }}
                >
                  {allChecked ? 'Uncheck All' : 'Check All'}
                </button>
                <button
                  onClick={copyGroceryList}
                  className="btn-action text-xs px-2 py-1 rounded flex items-center gap-1"
                  style={{ background: 'var(--muted-bg)', border: 'none', cursor: 'pointer' }}
                >
                  {listCopied ? <Ri name="ri-check-line" size={12} /> : <Ri name="ri-file-copy-line" size={12} />}
                  {listCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recipe.ingredients.map((ing, i) => {
                  const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
                  const { quantity: dispQty, unit: dispUnit } = convertUnit(scaled, ing.unit, unitSystem);
                  const qty = dispQty > 0 ? `${fmtQty(dispQty)} ` : '';
                  const unit = dispUnit ? `${dispUnit} ` : '';
                  return (
                    <label key={i} className="grocery-label flex items-start gap-3 p-2 rounded" style={{ background: 'var(--muted-bg)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked[i] ?? true}
                        onChange={() => toggleItem(i)}
                        style={{ marginTop: '0.35rem', cursor: 'pointer', accentColor: 'var(--accent)' }}
                      />
                      <span style={{ flex: 1 }}>
                        <span style={{ opacity: checked[i] ? 1 : 0.5 }}>
                          {qty}{unit}{ingredientNames[i] ?? ing.name}
                        </span>
                        {ing.prep && <span style={{ color: 'var(--muted)', fontSize: '0.85em', marginLeft: '0.25rem' }}>({ing.prep})</span>}
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                onClick={() => setGroceryOpen(false)}
                className="btn-text mt-4 w-full"
                style={{ color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '0.5rem', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Source link ── */}
        {sourceUrl && (
          <div className="no-print mt-8 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.85em', color: 'var(--muted)' }}>
              Source:{' '}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
              >
                {sourceUrl}
              </a>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
