import type { Recipe } from '../utils/extractRecipe';

function fmtQty(n: number): string {
  // Strip trailing zeros: 1.50 → "1.5", 2.00 → "2"
  return parseFloat(n.toFixed(2)).toString();
}

function buildIngredientItems(
  base: Recipe['ingredients'],
  baseServings: number,
  currentServings: number,
): string {
  const scale = currentServings / baseServings;
  return base.map((ing) => {
    const scaled = ing.quantity > 0 ? ing.quantity * scale : 0;
    const qty = scaled > 0 ? `<span class="qty">${fmtQty(scaled)}</span> ` : '';
    const unit = ing.unit ? `${ing.unit} ` : '';
    return `<li>${qty}${unit}${ing.name}</li>`;
  }).join('');
}

function showRecipeOverlay(recipe: Recipe) {
  document.getElementById('kaicook-host')?.remove();

  const host = document.createElement('div');
  host.id = 'kaicook-host';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const baseServings = recipe.servings > 0 ? recipe.servings : 1;
  let currentServings = baseServings;

  const stepItems = recipe.steps.map((step) => `<li><span>${step}</span></li>`).join('');

  const timeSpan = recipe.totalTime ? `<span>${recipe.totalTime}</span>` : '';

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      .overlay {
        position: fixed;
        inset: 0;
        background: #fafaf8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
        color: #1a1a1a;
        overflow-y: auto;
        pointer-events: all;
        -webkit-font-smoothing: antialiased;
      }

      .container {
        max-width: 860px;
        margin: 0 auto;
        padding: 2.5rem 2rem 5rem;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e8e8e4;
      }

      .brand {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #aaa;
      }

      .close {
        appearance: none;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.25rem;
        color: #bbb;
        line-height: 1;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        transition: color 0.15s, background 0.15s;
      }
      .close:hover { color: #333; background: #f0f0ec; }

      h1 {
        font-size: clamp(1.5rem, 4vw, 2.25rem);
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.02em;
        margin-bottom: 0.75rem;
      }

      .description {
        color: #666;
        font-size: 1rem;
        line-height: 1.65;
        margin-bottom: 1rem;
        max-width: 640px;
      }

      .meta {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        font-size: 0.875rem;
        color: #888;
        margin-bottom: 2.5rem;
      }

      .stepper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .stepper-label {
        color: #888;
      }

      .step-btn {
        appearance: none;
        background: #f0f0ec;
        border: none;
        cursor: pointer;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 4px;
        font-size: 1rem;
        line-height: 1;
        color: #555;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .step-btn:hover { background: #e4e4e0; color: #111; }
      .step-btn:disabled { opacity: 0.35; cursor: default; }

      .servings-count {
        font-weight: 600;
        color: #1a1a1a;
        min-width: 1.5rem;
        text-align: center;
      }

      .divider {
        border: none;
        border-top: 1px solid #e8e8e4;
        margin-bottom: 2.5rem;
      }

      .sections {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 4rem;
      }

      @media (max-width: 640px) {
        .sections { grid-template-columns: 1fr; gap: 2.5rem; }
      }

      .section-label {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #aaa;
        margin-bottom: 1.25rem;
      }

      .ingredients { list-style: none; }
      .ingredients li {
        padding: 0.55rem 0;
        border-bottom: 1px solid #f0f0ec;
        font-size: 0.9375rem;
        line-height: 1.45;
        color: #2a2a2a;
      }
      .ingredients li:last-child { border-bottom: none; }
      .qty { font-weight: 600; }

      .steps { list-style: none; counter-reset: steps; }
      .steps li {
        counter-increment: steps;
        display: grid;
        grid-template-columns: 1.75rem 1fr;
        gap: 1rem;
        padding: 0.85rem 0;
        border-bottom: 1px solid #f0f0ec;
        font-size: 0.9375rem;
        line-height: 1.65;
        color: #2a2a2a;
        align-items: start;
      }
      .steps li:last-child { border-bottom: none; }
      .steps li::before {
        content: counter(steps);
        font-size: 0.7rem;
        font-weight: 700;
        color: #ccc;
        padding-top: 0.3rem;
        text-align: right;
      }
    </style>

    <div class="overlay">
      <div class="container">
        <div class="header">
          <span class="brand">kaiCook</span>
          <button class="close" id="kaicook-close" aria-label="Close">✕</button>
        </div>

        <h1>${recipe.title}</h1>
        ${recipe.description ? `<p class="description">${recipe.description}</p>` : ''}

        <div class="meta">
          ${recipe.servings > 0 ? `
          <div class="stepper">
            <span class="stepper-label">Serves</span>
            <button class="step-btn" id="kaicook-dec" aria-label="Decrease servings">−</button>
            <span class="servings-count" id="kaicook-servings">${baseServings}</span>
            <button class="step-btn" id="kaicook-inc" aria-label="Increase servings">+</button>
          </div>
          ` : ''}
          ${timeSpan}
        </div>

        <hr class="divider" />

        <div class="sections">
          <div>
            <p class="section-label">Ingredients</p>
            <ul class="ingredients" id="kaicook-ingredients">
              ${buildIngredientItems(recipe.ingredients, baseServings, currentServings)}
            </ul>
          </div>
          <div>
            <p class="section-label">Steps</p>
            <ol class="steps">${stepItems}</ol>
          </div>
        </div>
      </div>
    </div>
  `;

  // Close button
  shadow.getElementById('kaicook-close')!.addEventListener('click', () => host.remove());

  // Stepper — only wired if servings > 0
  if (recipe.servings > 0) {
    const decBtn = shadow.getElementById('kaicook-dec') as HTMLButtonElement;
    const incBtn = shadow.getElementById('kaicook-inc') as HTMLButtonElement;
    const servingsEl = shadow.getElementById('kaicook-servings')!;
    const ingredientsEl = shadow.getElementById('kaicook-ingredients')!;

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

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[kaiCook] Content script loaded.');

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
