// Generates app icons from build/logo-source.png.
// The source has an opaque white background. Everything outside the card is
// converted "white → transparent" so the drop shadow becomes a soft translucent
// shadow that works on light and dark backgrounds. The card itself stays opaque.
//
// Usage: npm run icons
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const SRC = resolve(root, 'build/logo-source.png');

// Card rectangle in the 626×626 source (inclusive), measured from the pixels.
const CARD = { x0: 105, y0: 157, x1: 519, y1: 442 };

const OUTPUTS = [
  { file: 'build/icon.png', size: 1024 }, // electron-builder derives .ico / .icns from this
  { file: 'resources/icon.png', size: 256 }, // runtime window icon (Linux / dev)
  { file: 'src/renderer/src/assets/logo.png', size: 128 }, // in-app logo
];

/**
 * "Colour to alpha" against white for one RGBA pixel, in place — applied only to
 * near-grey pixels (background + shadow). Saturated pixels (the arrows) stay opaque;
 * in between, alpha is blended so anti-aliased edges stay smooth.
 */
function whiteToAlpha(d, i) {
  const r = d[i],
    g = d[i + 1],
    b = d[i + 2];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const keep = Math.min(Math.max((chroma - 12) / 36, 0), 1); // 0 = grey, 1 = colourful

  const a = Math.max(255 - r, 255 - g, 255 - b) / 255;
  const alpha = keep + (1 - keep) * a;
  if (alpha === 0) {
    d[i + 3] = 0;
    return;
  }
  // Unmix the white contribution in proportion to how much we made transparent.
  const un = (c) => Math.min(255, Math.max(0, Math.round((c - 255 * (1 - alpha)) / alpha)));
  d[i] = un(r);
  d[i + 1] = un(g);
  d[i + 2] = un(b);
  d[i + 3] = Math.round(alpha * 255);
}

/** Bounding box of pixels with alpha above `min` (faint shadow tails are dropped). */
function opaqueBox(d, W, H, min) {
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const inCard = x >= CARD.x0 && x <= CARD.x1 && y >= CARD.y0 && y <= CARD.y1;
    if (!inCard) whiteToAlpha(data, (y * W + x) * 4);
  }
}

// Trim the (now transparent) margins, then centre on a square canvas with padding.
const box = opaqueBox(data, W, H, 24);
const trimmed = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .extract(box)
  .png()
  .toBuffer({ resolveWithObject: true });

const side = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 1.04);
const square = await sharp({
  create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: trimmed.data, gravity: 'center' }])
  .png()
  .toBuffer();

for (const { file, size } of OUTPUTS) {
  const out = resolve(root, file);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(square).resize(size, size, { kernel: 'lanczos3' }).png().toFile(out);
  console.log(`✔ ${file} (${size}×${size})`);
}
