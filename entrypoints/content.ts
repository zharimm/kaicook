import type { Recipe } from '../utils/extractRecipe';

// ─── Inline SVG icons (Lucide-compatible) ────────────────────────────────────
const SVG = {
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  chefHat: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,

  externalLink: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

// ─── Tailwind CDN via document.head ──────────────────────────────────────────
// Shadow DOM is isolated from document styles, so we:
//   1. Inject Tailwind Play CDN into document.head (once per page)
//   2. Seed a hidden div with every utility class we use so Tailwind generates their CSS
//   3. Clone new <style> elements from document.head into the shadow root via MutationObserver

const CDN_ID = 'kaicook-tw';

// Every Tailwind utility class referenced in the overlay HTML — must be visible
// to Tailwind's document scanner so it generates the corresponding CSS rules.
const SEED_CLASSES = [
  'fixed', 'inset-0', 'overflow-y-auto', 'pointer-events-auto',
  'flex', 'flex-wrap', 'flex-col', 'items-start', 'items-center',
  'justify-between', 'justify-center', 'shrink-0',
  'gap-2', 'gap-3', 'gap-4',
  'grid', 'sm:grid-cols-2',
  'inline-flex',
  'rounded-lg', 'rounded-full',
  'border',
  'p-3', 'p-4', 'px-4', 'py-2', 'py-3', 'px-3',
  'pt-1', 'pt-4', 'mt-0.5',
  'h-2', 'w-2', 'h-8', 'w-8',
  'font-bold', 'font-semibold', 'font-medium',
  'text-3xl', 'text-xl', 'text-sm', 'text-xs',
  'tracking-tight', 'leading-relaxed',
  'transition-colors',
  'max-w-4xl', 'mx-auto', 'px-6', 'py-10', 'pb-20',
].join(' ');

function ensureTailwind(): void {
  if (document.getElementById(CDN_ID)) return;

  // Config must be set before the CDN script runs
  const cfg = document.createElement('script');
  cfg.textContent = 'window.tailwind={config:{darkMode:"class"}}';
  document.head.appendChild(cfg);

  const s = document.createElement('script');
  s.id = CDN_ID;
  s.src = 'https://cdn.tailwindcss.com';
  document.head.appendChild(s);

  // Seed div: Tailwind scans class names across the page to decide what CSS to emit.
  // By listing every class we use here, Tailwind includes them even though they
  // only appear inside the shadow DOM where Tailwind's observer can't reach.
  const seed = document.createElement('div');
  seed.id = `${CDN_ID}-seed`;
  seed.setAttribute('aria-hidden', 'true');
  seed.style.cssText = 'display:none!important;position:absolute;pointer-events:none;';
  seed.className = SEED_CLASSES;
  document.body.appendChild(seed);
}

// Clones every <style> element from document.head into the shadow root so that
// Tailwind-generated styles (added dynamically by the CDN script) are available
// inside the shadow DOM. Returns a cleanup function to disconnect the observer.
function syncTailwindToShadow(shadow: ShadowRoot): () => void {
  const seen = new WeakSet<Node>();

  const sync = () => {
    document.head.querySelectorAll('style').forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      shadow.insertBefore(el.cloneNode(true), shadow.firstChild);
    });
  };

  sync();
  const obs = new MutationObserver(sync);
  obs.observe(document.head, { childList: true });
  return () => obs.disconnect();
}

// ─── Ingredient helpers ───────────────────────────────────────────────────────
function fmtQty(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

function buildIngredientItems(
  base: Recipe['ingredients'],
  baseServings: number,
  currentServings: number,
): string {
  const scale = currentServings / baseServings;
  return base
    .map((ing) => {
      const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
      const qty = scaled > 0 ? `<span class="qty">${fmtQty(scaled)}</span> ` : '';
      const unit = ing.unit ? `${ing.unit} ` : '';
      return `
        <li class="ingredient-item">
          <span class="dot"></span>
          <span>${qty}${unit}${ing.name}</span>
        </li>`;
    })
    .join('');
}

// ─── Overlay renderer ─────────────────────────────────────────────────────────
function showRecipeOverlay(recipe: Recipe): void {
  document.getElementById('kaicook-host')?.remove();

  const host = document.createElement('div');
  host.id = 'kaicook-host';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const stopSync = syncTailwindToShadow(shadow);

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const baseServings = recipe.servings > 0 ? recipe.servings : 1;
  let currentServings = baseServings;
  const sourceUrl = document.URL;

  // ── Meta cards ──
  const metaCards: string[] = [];
  if (recipe.totalTime) {
    metaCards.push(`
      <div class="meta-card">
        <span class="meta-icon">${SVG.clock}</span>
        <div>
          <p class="meta-label">Total time</p>
          <p class="meta-value">${recipe.totalTime}</p>
        </div>
      </div>`);
  }
  if (recipe.servings > 0) {
    metaCards.push(`
      <div class="meta-card">
        <span class="meta-icon">${SVG.users}</span>
        <div>
          <p class="meta-label">Serves</p>
          <div class="stepper">
            <button class="step-btn" id="kc-dec" aria-label="Decrease servings">−</button>
            <span id="kc-servings">${baseServings}</span>
            <button class="step-btn" id="kc-inc" aria-label="Increase servings">+</button>
          </div>
        </div>
      </div>`);
  }

  // ── Step list ──
  const stepItems = recipe.steps
    .map(
      (step, i) => `
      <li class="step-item">
        <span class="step-num">${i + 1}</span>
        <p class="step-text">${step}</p>
      </li>`,
    )
    .join('');

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── Theme tokens ── */
      .overlay {
        --bg:           #fafaf8;
        --fg:           #1a1a1a;
        --card:         #ffffff;
        --border:       #e8e8e4;
        --muted:        #888888;
        --muted-bg:     #f0f0ec;
        --accent:       #4f46e5;
        --accent-bg:    rgba(79, 70, 229, 0.08);
        --accent-border:rgba(79, 70, 229, 0.2);
        --primary:      #1a1a1a;
        --primary-fg:   #ffffff;
      }
      .overlay.dark {
        --bg:           #111110;
        --fg:           #f0efe9;
        --card:         #1c1b18;
        --border:       #2e2d29;
        --muted:        #888888;
        --muted-bg:     #242320;
        --accent:       #818cf8;
        --accent-bg:    rgba(129, 140, 248, 0.10);
        --accent-border:rgba(129, 140, 248, 0.25);
        --primary:      #f0efe9;
        --primary-fg:   #111110;
      }

      /* ── Base ── */
      .overlay {
        position: fixed;
        inset: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
        -webkit-font-smoothing: antialiased;
        overflow-y: auto;
        pointer-events: all;
      }

      /* ── Container ── */
      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 2.5rem 1.5rem 5rem;
      }

      /* ── Topbar ── */
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border);
      }
      .brand {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .topbar-actions { display: flex; align-items: center; gap: 0.4rem; }

      /* ── Buttons ── */
      button { appearance: none; border: none; cursor: pointer; line-height: 1; font-family: inherit; }

      .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: var(--muted);
        padding: 0.4rem;
        border-radius: 6px;
      }
      .icon-btn:hover { color: var(--fg); background: var(--muted-bg); }

      .copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 500;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        background: var(--muted-bg);
        color: var(--fg);
        flex-shrink: 0;
      }
      .copy-btn:hover { opacity: 0.75; }

      /* ── Title block ── */
      .title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.75rem;
      }
      h1 {
        font-size: clamp(1.5rem, 4vw, 2.25rem);
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }
      .description {
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.65;
        max-width: 640px;
        margin-bottom: 1.5rem;
      }

      /* ── Meta cards ── */
      .meta-row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 2rem; }
      .meta-card {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.65rem 0.9rem;
      }
      .meta-icon { color: var(--muted); display: flex; }
      .meta-label { font-size: 0.7rem; color: var(--muted); margin-bottom: 0.15rem; }
      .meta-value { font-size: 0.875rem; font-weight: 600; }

      /* ── Stepper ── */
      .stepper { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
      .stepper span { font-size: 0.875rem; font-weight: 600; min-width: 1.25rem; text-align: center; }
      .step-btn {
        background: var(--muted-bg);
        color: var(--fg);
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 4px;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .step-btn:hover { opacity: 0.7; }
      .step-btn:disabled { opacity: 0.3; cursor: default; }

      /* ── Divider ── */
      .divider { border: none; border-top: 1px solid var(--border); margin-bottom: 2rem; }

      /* ── Two-column layout ── */
      .sections { display: grid; grid-template-columns: 260px 1fr; gap: 3.5rem; }
      @media (max-width: 640px) { .sections { grid-template-columns: 1fr; gap: 2rem; } }

      /* ── Section header ── */
      .section-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 0.875rem;
      }
      .section-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        flex-shrink: 0;
      }

      /* ── Ingredients ── */
      .ingredients { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
      .ingredient-item {
        display: flex;
        align-items: flex-start;
        gap: 0.65rem;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.6rem 0.75rem;
        font-size: 0.9375rem;
        line-height: 1.45;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--muted);
        opacity: 0.5;
        flex-shrink: 0;
        margin-top: 0.35rem;
      }
      .qty { font-weight: 600; }

      /* ── Steps ── */
      .steps { list-style: none; display: flex; flex-direction: column; gap: 1rem; }
      .step-item { display: flex; align-items: flex-start; gap: 1rem; }
      .step-num {
        flex-shrink: 0;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        background: var(--primary);
        color: var(--primary-fg);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.75rem;
      }
      .step-text {
        padding-top: 0.3rem;
        font-size: 0.9375rem;
        line-height: 1.65;
      }

      /* ── Source ── */
      .source-row {
        padding-top: 1.5rem;
        border-top: 1px solid var(--border);
        margin-top: 2.5rem;
      }
      .source-link {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.8125rem;
        color: var(--muted);
        text-decoration: none;
      }
      .source-link:hover { color: var(--fg); }
    </style>

    <div class="overlay${isDark ? ' dark' : ''}" id="kc-overlay">
      <div class="container">

        <!-- Topbar -->
        <div class="topbar">
          <span class="brand">kaiCook</span>
          <div class="topbar-actions">
            <button class="icon-btn" id="kc-theme" aria-label="Toggle theme" title="Toggle dark/light mode">
              ${isDark ? SVG.sun : SVG.moon}
            </button>
            <button class="icon-btn" id="kc-close" aria-label="Close overlay">
              ${SVG.x}
            </button>
          </div>
        </div>

        <!-- Title + copy -->
        <div class="title-row">
          <h1>${recipe.title}</h1>
          <button class="copy-btn" id="kc-copy" aria-label="Copy recipe to clipboard">
            <span id="kc-copy-icon">${SVG.copy}</span>
            <span id="kc-copy-label">Copy</span>
          </button>
        </div>

        ${recipe.description ? `<p class="description">${recipe.description}</p>` : ''}

        <!-- Meta cards -->
        ${metaCards.length > 0 ? `<div class="meta-row">${metaCards.join('')}</div>` : ''}

        <hr class="divider" />

        <!-- Ingredients + Steps -->
        <div class="sections">
          <div>
            <p class="section-label"><span class="section-dot"></span>Ingredients</p>
            <ul class="ingredients" id="kc-ingredients">
              ${buildIngredientItems(recipe.ingredients, baseServings, currentServings)}
            </ul>
          </div>
          <div>
            <p class="section-label"><span class="section-dot"></span>Steps</p>
            <ol class="steps">${stepItems}</ol>
          </div>
        </div>

        <!-- Source link -->
        <div class="source-row">
          <a class="source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">
            ${SVG.externalLink}
            View original recipe
          </a>
        </div>

      </div>
    </div>
  `;

  const overlay = shadow.getElementById('kc-overlay')!;

  // Close
  shadow.getElementById('kc-close')!.addEventListener('click', () => {
    host.remove();
    stopSync();
  });

  // Dark/light toggle
  let dark = isDark;
  const themeBtn = shadow.getElementById('kc-theme')!;
  themeBtn.addEventListener('click', () => {
    dark = !dark;
    overlay.classList.toggle('dark', dark);
    themeBtn.innerHTML = dark ? SVG.sun : SVG.moon;
  });

  // Copy to clipboard
  const copyBtn = shadow.getElementById('kc-copy')!;
  const copyIcon = shadow.getElementById('kc-copy-icon')!;
  const copyLabel = shadow.getElementById('kc-copy-label')!;
  copyBtn.addEventListener('click', () => {
    const lines: string[] = [
      recipe.title,
      '',
      'INGREDIENTS:',
      ...recipe.ingredients.map((ing) => {
        const qty = ing.quantity > 0 ? `${fmtQty(ing.quantity)} ` : '';
        const unit = ing.unit ? `${ing.unit} ` : '';
        return `• ${qty}${unit}${ing.name}`;
      }),
      '',
      'STEPS:',
      ...recipe.steps.map((step, i) => `${i + 1}. ${step}`),
      '',
      `Source: ${sourceUrl}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      copyIcon.textContent = '✓';
      copyLabel.textContent = 'Copied!';
      setTimeout(() => {
        copyIcon.textContent = '';
        copyIcon.innerHTML = SVG.copy;
        copyLabel.textContent = 'Copy';
      }, 2000);
    });
  });

  // Servings stepper
  if (recipe.servings > 0) {
    const decBtn = shadow.getElementById('kc-dec') as HTMLButtonElement;
    const incBtn = shadow.getElementById('kc-inc') as HTMLButtonElement;
    const servingsEl = shadow.getElementById('kc-servings')!;
    const ingredientsEl = shadow.getElementById('kc-ingredients')!;

    function updateServings(next: number) {
      currentServings = next;
      servingsEl.textContent = String(currentServings);
      decBtn.disabled = currentServings <= 1;
      ingredientsEl.innerHTML = buildIngredientItems(recipe.ingredients, baseServings, currentServings);
    }

    decBtn.disabled = currentServings <= 1;
    decBtn.addEventListener('click', () => updateServings(currentServings - 1));
    incBtn.addEventListener('click', () => updateServings(currentServings + 1));
  }
}

// ─── Content script entry ─────────────────────────────────────────────────────
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[kaiCook] Content script loaded.');
    ensureTailwind();

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'PING') {
        sendResponse({ pong: true });
      }

      if (message.type === 'GET_PAGE_TEXT') {
        sendResponse({ text: document.body.innerText });
      }

      if (message.type === 'SHOW_OVERLAY') {
        console.log('[kaiCook] Rendering recipe overlay…');
        showRecipeOverlay(message.recipe as Recipe);
        sendResponse({ ok: true });
      }

      return true;
    });
  },
});
