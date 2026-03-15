#!/usr/bin/env node
// Generates kaiCook brand icons at 16, 32, 48, 128px.
// Output: public/icons/{size}.png
// Usage: node scripts/generate-icons.js

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

// Build an SVG string for the given pixel size.
// All coordinates are expressed in a 100×100 viewBox then scaled by sharp.
function buildSvg(size) {
  const r = Math.round(size * 0.2); // corner radius ≈ 20% of size

  // Cake SVG drawn in a 100×100 viewBox, white strokes on coral background.
  // Shapes:
  //   - rounded-rect background (#FF6B6B)
  //   - candle flame (ellipse)
  //   - candle stem (rect)
  //   - two cake layers (rounded rects)
  //   - wavy frosting suggestion (path)
  const sw = 5; // stroke width in viewBox units

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <!-- Background -->
  <rect width="100" height="100" rx="${r}" ry="${r}" fill="#FF6B6B"/>

  <!-- Candle flame -->
  <ellipse cx="50" cy="18" rx="5" ry="7" fill="white" opacity="0.95"/>

  <!-- Candle stem -->
  <rect x="46" y="24" width="8" height="14" rx="2" fill="white"/>

  <!-- Top cake layer -->
  <rect x="26" y="38" width="48" height="18" rx="5" fill="none" stroke="white" stroke-width="${sw}" stroke-linejoin="round"/>

  <!-- Frosting drips on top layer -->
  <path d="M32 38 Q37 32 42 38 Q47 32 52 38 Q57 32 62 38 Q67 32 68 38"
        fill="none" stroke="white" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Bottom cake layer -->
  <rect x="18" y="56" width="64" height="22" rx="5" fill="none" stroke="white" stroke-width="${sw}" stroke-linejoin="round"/>

  <!-- Frosting drips on bottom layer -->
  <path d="M26 56 Q32 50 38 56 Q44 50 50 56 Q56 50 62 56 Q68 50 74 56"
        fill="none" stroke="white" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

await mkdir(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const svg = buildSvg(size);
  const outPath = join(OUT_DIR, `${size}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`✓ ${outPath}`);
}

console.log('Done.');
