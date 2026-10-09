// Renders scripts/icon.svg into the PNGs the manifest and iOS need.
// Run with `npm run icons` after editing the SVG; the PNGs are committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const src = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// Maskable: shrink the art into the 80% safe zone, keep the solid background.
const maskable = src.replace('<g id="art">', '<g id="art" transform="translate(512 512) scale(0.8) translate(-512 -512)">');

const jobs = [
  ['apple-touch-icon.png', src, 180],
  ['icon-192.png', src, 192],
  ['icon-512.png', src, 512],
  ['icon-maskable-512.png', maskable, 512],
];

for (const [name, svg, size] of jobs) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(name, out), png);
  console.log('wrote', name, size);
}
writeFileSync(new URL('icon.svg', out), src);
