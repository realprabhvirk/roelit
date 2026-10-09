// Fit a card's text into a box: as big as possible, never splitting a word,
// at most 3 lines, lines balanced. Measured with canvas so it's cheap enough
// to run on every card.

let ctx: CanvasRenderingContext2D | null = null;

function measure(text: string, size: number, family: string): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * size * 0.5;
  ctx.font = `400 ${size}px ${family}`;
  return ctx.measureText(text).width;
}

function wrap(words: string[], widths: number[], space: number, maxW: number): string[] | null {
  const lines: string[] = [];
  let cur = '';
  let curW = 0;
  for (let i = 0; i < words.length; i++) {
    const w = widths[i];
    if (w > maxW) return null;
    if (!cur) {
      cur = words[i];
      curW = w;
    } else if (curW + space + w <= maxW) {
      cur += ' ' + words[i];
      curW += space + w;
    } else {
      lines.push(cur);
      cur = words[i];
      curW = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export type Fit = { size: number; lines: string[] };

export function fitText(
  text: string,
  boxW: number,
  boxH: number,
  opts: { family?: string; lineHeight?: number; maxLines?: number; maxSize?: number } = {},
): Fit {
  const family = opts.family ?? 'Anton';
  const lh = opts.lineHeight ?? 0.95;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const maxLines = Math.min(opts.maxLines ?? 3, Math.max(1, words.length));
  // Measure at a reference size; widths scale linearly.
  const REF = 100;
  const refW = words.map((w) => measure(w, REF, family));
  const refSpace = measure(' ', REF, family);
  // Small safety margin for sub-pixel differences between canvas and layout.
  const W = boxW * 0.93;

  const attempt = (size: number) => {
    const k = size / REF;
    const lines = wrap(words, refW.map((w) => w * k), refSpace * k, W);
    if (!lines || lines.length > maxLines || lines.length * size * lh > boxH) return null;
    return lines;
  };

  let lo = 10;
  let hi = Math.min(opts.maxSize ?? 400, boxH / lh);
  let best: string[] = [text.toUpperCase()];
  let bestSize = lo;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const lines = attempt(mid);
    if (lines) {
      best = lines;
      bestSize = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Balance: squeeze the wrap width while the line count stays the same.
  if (best.length > 1) {
    const k = bestSize / REF;
    const ws = refW.map((w) => w * k);
    let a = Math.max(...ws);
    let b = W;
    for (let i = 0; i < 14; i++) {
      const m = (a + b) / 2;
      const l = wrap(words, ws, refSpace * k, m);
      if (l && l.length === best.length) b = m;
      else a = m;
    }
    best = wrap(words, ws, refSpace * k, b) ?? best;
  }
  return { size: Math.floor(bestSize), lines: best };
}
