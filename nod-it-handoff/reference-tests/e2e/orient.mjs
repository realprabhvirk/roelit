import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const url = process.argv[2];
const SP = './shots';
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
async function run(angle, flip) {
  const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
  await c.addInitScript(([a, f]) => {
    localStorage.setItem('roelit:installDismissed', 'true');
    localStorage.setItem('roelit:settings', JSON.stringify({ voice: false, roundLength: 30, record: true, flipVideo: f }));
    window.__angle = 0;
    Object.defineProperty(screen.orientation, 'angle', { get: () => window.__angle, configurable: true });
    window.__setAngle = a;
  }, [angle, flip]);
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForSelector('.deck-tile');
  check(`deck renamed (${angle}${flip ? ' flip' : ''})`, !!(await p.$('.deck-tile >> text=SPORRENCESON')));
  await p.locator('.deck-tile', { hasText: 'Animals' }).tap(); await p.waitForTimeout(600);
  await p.locator('.sheet-root.open .btn-primary').tap();
  await p.waitForSelector('.pre-preview', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2600); // preview in portrait: learns how frames arrive
  const mode = await p.evaluate(() => localStorage.getItem('roelit:frameMode'));
  await p.evaluate(() => (window.__angle = window.__setAngle));
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400);
  await p.locator('.pre-actions .btn-primary').tap(); await p.waitForTimeout(3800);
  const png = await p.evaluate(() => [...document.querySelectorAll('body > div canvas')].find((cv) => cv.width === 1280)?.toDataURL('image/png'));
  writeFileSync(`${SP}/90-orient-${angle}${flip ? '-flip' : ''}.png`, Buffer.from(png.split(',')[1], 'base64'));
  const logs = await p.evaluate(() => localStorage.getItem('roelit:log') || '');
  const rot = (await p.evaluate(() => window.__rot)) ?? (logs.match(/rotation (\d+)/) || [])[1];
  await c.close();
  return { mode, rot, errs };
}
const a = await run(90, false);
check('learned: fake camera frames never turn (landscapeRaw)', a.mode === '"landscapeRaw"', a.mode);
check('landscape one way: no rotation', a.rot === '0', `rotation ${a.rot}`);
const b2 = await run(270, false);
check('landscape the other way: turned 180 so it is not upside down', b2.rot === '180', `rotation ${b2.rot}`);
const c2 = await run(270, true);
check('manual flip adds a half turn', c2.rot === '0', `rotation ${c2.rot}`);
check('no page errors', [a, b2, c2].every((r) => !r.errs.length), [a, b2, c2].flatMap((r) => r.errs).join(' | '));
console.log(out.join('\n'));
await b.close();
