import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
async function setup(settings) {
  const c = await b.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, permissions: ['camera', 'microphone'] });
  await c.addInitScript((s) => {
    localStorage.setItem('roelit:installDismissed', 'true');
    localStorage.setItem('roelit:micAsked', 'true');
    localStorage.setItem('roelit:settings', JSON.stringify(s));
    window.__v = []; navigator.vibrate = (p) => (window.__v.push(JSON.stringify(p)), true);
  }, settings);
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForSelector('.deck-tile');
  await p.locator('.deck-tile', { hasText: 'Animals' }).tap(); await p.waitForTimeout(600);
  await p.locator('.sheet-root.open .btn-primary').tap(); await p.waitForTimeout(800);
  return { c, p, errs };
}
// A: recorded round, end early -> confirm, pause, keep playing, end -> results with clip
{
  const { c, p, errs } = await setup({ roundLength: 60, voice: false, record: true });
  await p.waitForSelector('.pre-preview', { timeout: 5000 }).catch(() => {});
  await p.locator('.pre-actions .btn-primary').tap(); await p.waitForTimeout(3700);
  await p.evaluate(() => (window.__v = []));
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(900);
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(900);
  check('ROEL IT! = two pulses, pass = one long', (await p.evaluate(() => window.__v.join(' '))) === '[14,55,14] [45]', await p.evaluate(() => window.__v.join(' ')));
  await p.locator('[aria-label="End round"]').tap(); await p.waitForTimeout(300);
  check('X asks first', !!(await p.$('.quit-confirm')));
  const t1 = await p.textContent('.round-timer'); const s1 = await p.textContent('.round-score b');
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(2200);
  check('clock paused while asking', (await p.textContent('.round-timer')) === t1, `${t1} -> ${await p.textContent('.round-timer')}`);
  check('no scoring while asking', (await p.textContent('.round-score b')) === s1);
  await p.locator('.quit-actions .btn-secondary').tap(); await p.waitForTimeout(1500);
  check('Keep playing resumes the clock', (await p.textContent('.round-timer')) !== t1 && !(await p.$('.quit-confirm')));
  await p.locator('[aria-label="End round"]').tap(); await p.waitForTimeout(300);
  await p.locator('.quit-actions .btn-primary').tap();
  await p.waitForSelector('.results', { timeout: 5000 }).catch(() => {});
  check('End round goes to results', !!(await p.$('.results')));
  check('labelled ended early', /ended early/.test(await p.textContent('.results-meta')));
  await p.waitForSelector('.clip-card video', { timeout: 8000 }).catch(() => {});
  const size = await p.evaluate(async () => { const v = document.querySelector('.clip-card video'); return v ? (await fetch(v.src).then((r) => r.blob())).size : 0; });
  check('video kept after ending early', size > 20000, `${size} bytes`);
  check('Save to Photos offered', !!(await p.$('.clip-actions .btn-primary')));
  check('early exit not counted as best', (await p.evaluate(() => localStorage.getItem('roelit:best'))) === '{}' || !(await p.evaluate(() => localStorage.getItem('roelit:best'))));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await c.close();
}
// B: not recording, end during countdown with nothing played -> straight back to decks
{
  const { c, p, errs } = await setup({ roundLength: 60, voice: false, record: false });
  await p.locator('.pre-actions .btn-primary').tap(); await p.waitForTimeout(800);
  await p.locator('[aria-label="End round"]').tap(); await p.waitForTimeout(200);
  await p.locator('.quit-actions .btn-primary').tap(); await p.waitForTimeout(1500);
  check('ending with nothing played goes back to decks', !(await p.$('.fullscreen')) && !!(await p.$('.deck-tile')));
  check('no page errors (B)', errs.length === 0, errs.join(' | '));
  await c.close();
}
console.log(out.join('\n'));
await b.close();
