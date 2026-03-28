# kaiCook

A Chrome extension that extracts recipes from any webpage and displays them in a clean, interactive UI. No ads, no life stories, just the recipe.

## What it does

1. Visit any recipe page and click the extension icon
2. kaiCook extracts the recipe instantly (JSON-LD local parse or AI fallback)
3. A clean recipe tab opens with ingredients, steps, and metadata
4. Adjust servings, switch units (imperial/metric), copy to clipboard, or print

## Features

- **Instant extraction** - Local JSON-LD parsing for most recipe sites (no API call needed)
- **AI fallback** - Claude API extraction for pages without structured data
- **Serving size scaling** - Adjust portions, ingredient quantities scale proportionally
- **Unit conversion** - Toggle between imperial and metric
- **Dark/light mode** - Follows system preference, manual toggle available
- **Grocery list** - Select ingredients and copy a formatted shopping list
- **Print layout** - Clean print-optimized view
- **AI ingredient swaps** (optional) - Toggle on AI Assistant for smart substitution suggestions with recipe-aware impact notes
- **Static swap database** - ~35 common substitutions available offline without API calls
- **Non-recipe detection** - Graceful handling of non-recipe pages with friendly messages

## Architecture

```
User clicks extension icon
  -> popup sends EXTRACT_RECIPE to background service worker
  -> background gets page content via content script
  -> tries local JSON-LD parse first (instant, no API cost)
  -> falls back to Claude API if no structured data found
  -> opens dedicated extension tab with clean recipe UI
```

### Progressive enrichment pipeline

kaiCook uses a three-phase approach so the recipe is usable immediately:

1. **Local parse** (~0ms) - JSON-LD extraction + regex label cleaning
2. **Static swaps** (~8ms) - Offline substitution database with fuzzy matching
3. **AI polish** (opt-in, ~2s) - User toggles AI Assistant for additional swap suggestions

## Tech stack

- **[WXT](https://wxt.dev)** v0.20.18 - Chrome extension framework (Manifest V3)
- **React 19** + TypeScript
- **Claude API** (Anthropic) - Haiku model for extraction and swaps
- **Tailwind CSS** v4 via Vite plugin

## Setup

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Install

```bash
git clone https://github.com/zharimm/kaicook.git
cd kaicook
npm install
```

### Configure your API key

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

The API key is injected at build time via Vite's `define` and is only used client-side in the extension. It is never committed to the repository.

### Development

```bash
npm run dev
```

Then load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3-dev` folder

The dev server provides HMR - changes to React components hot-reload without reloading the extension.

### Production build

```bash
npm run build
```

Load `.output/chrome-mv3` as an unpacked extension, or package for distribution:

```bash
npm run zip
```

### Type check

```bash
npm run compile
```

## Project structure

```
entrypoints/
  background.ts          # Service worker - extraction orchestration, API calls, caching
  content.ts             # Content script - page text extraction, JSON-LD capture
  popup/                 # Browser action popup
    App.tsx              # Popup UI - extraction trigger, error states
  recipe/                # Dedicated recipe tab
    App.tsx              # Main recipe display - ingredients, steps, swaps, grocery list
    style.css            # CSS variables, dark mode, print styles, animations
utils/
  extractRecipe.ts       # Claude API client - extraction, swap calls
  parseJsonLd.ts         # Local JSON-LD parser (no API needed)
  cleanLabels.ts         # Regex-based ingredient label cleaning
  staticSwaps.ts         # Offline substitution database (~35 entries)
public/
  icons/                 # Extension icons (16-128px)
reference/
  recipe-display.tsx     # v0 design reference (not used at runtime)
wxt.config.ts            # WXT + Vite configuration
```

## How extraction works

1. **Content script** captures `document.body.innerText` and any `<script type="application/ld+json">` containing Recipe schema
2. **Background** tries `parseJsonLdLocally()` first - parses structured Recipe data without an API call
3. If local parse fails, falls back to Claude API (`extractRecipe()`) with the page text
4. Recipe is cached in-memory (per tab) and persistently (per URL, up to 50 entries)
5. Recipe page opens in a new extension tab via `chrome.storage.session`

## How AI swaps work

When the user toggles on AI Assistant:

1. Static swap database is checked first for common substitutions
2. Only unmatched ingredients are sent to Claude Haiku
3. When a user clicks a substitute, `swapIngredient()` calls the API to:
   - Generate an impact note (how the swap affects the recipe)
   - Rewrite affected step text contextually (avoids naive string replacement)
   - Identify the most relevant step for the note
4. The ingredient pill, step text, and AI note update in place

## License

MIT
