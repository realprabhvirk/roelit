import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const b = await chromium.launch();
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
// A: Android-style (navigator.vibrate): record every pattern.
{
  const c = await b.newContext({ ...devices['Pixel 7'] });
  await c.addInitScript(() => {
    localStorage.setItem('roelit:installDismissed', 'true');
    window.__v = [];
    navigator.vibrate = (p) => (window.__v.push(JSON.stringify(p)), true);
  });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForSelector('.deck-tile');
  await p.locator('.tabbar button').nth(1).tap(); await p.waitForTimeout(200);
  await p.locator('.tabbar button').nth(2).tap(); await p.waitForTimeout(200);
  await p.locator('.seg button').nth(0).tap(); await p.waitForTimeout(200);
  const v1 = await p.evaluate(() => window.__v.slice());
  check('tabs + segmented give select ticks', v1.length === 3 && v1.every((x) => x === '6'), v1.join(','));
  await p.locator('.row', { hasText: 'Haptics' }).locator('input').tap(); await p.waitForTimeout(200);
  const before = await p.evaluate(() => window.__v.length);
  await p.locator('.tabbar button').nth(0).tap(); await p.waitForTimeout(200);
  check('Haptics switch off silences them', (await p.evaluate(() => window.__v.length)) === before);
  await p.locator('.tabbar button').nth(2).tap(); await p.waitForTimeout(200);
  await p.locator('.row', { hasText: 'Haptics' }).locator('input').tap(); await p.waitForTimeout(200);
  // Passcode wrong -> error pattern
  await p.locator('.tabbar button').nth(0).tap(); await p.waitForTimeout(300);
  const crew = p.locator('.deck-tile', { hasText: 'SPORRENCESON' }); await crew.scrollIntoViewIfNeeded(); await crew.tap(); await p.waitForTimeout(700);
  for (const d of '111111') { await p.locator('.sheet-root.open .key', { hasText: new RegExp('^' + d + '$') }).tap(); await p.waitForTimeout(40); }
  await p.waitForTimeout(2500);
  const v2 = await p.evaluate(() => window.__v.slice(-2));
  check('wrong code buzzes error', v2.includes('[24,50,24,50,24]'), v2.join(' '));
  await p.locator('.sheet-scrim').tap({ position: { x: 100, y: 50 } }).catch(() => {}); await p.waitForTimeout(600);
  // Round: tilt/keys -> success / medium
  await p.setViewportSize({ width: 915, height: 412 });
  await p.locator('.deck-tile', { hasText: 'Animals' }).tap(); await p.waitForTimeout(600);
  await p.locator('.sheet-root.open .btn-primary').tap(); await p.waitForTimeout(500);
  if (await p.$('text=Allow microphone')) { await p.locator('text=Skip voice').tap(); await p.waitForTimeout(300); }
  await p.locator('.pre-actions .btn-primary').tap(); await p.waitForTimeout(3600);
  await p.evaluate(() => (window.__v = []));
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(900);
  await p.locator('.tap-zone.left').tap(); await p.waitForTimeout(300);
  const v3 = await p.evaluate(() => window.__v.slice());
  check('ROEL IT! = success, pass = medium, tap zone only once', v3.join(' ') === '[12,70,22] 18', v3.join(' '));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await c.close();
}
// B: iPhone-style (no vibrate, native switch): ticks come from the hidden switch, focus never sticks.
{
  const c = await b.newContext({ ...devices['iPhone 13'] });
  await c.addInitScript(() => {
    localStorage.setItem('roelit:installDismissed', 'true');
    delete Navigator.prototype.vibrate;
    Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, writable: true, configurable: true });
    window.__ticks = 0;
    document.addEventListener('change', (e) => e.target.closest?.('[data-haptic-el]') && window.__ticks++, true);
  });
  const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForSelector('.deck-tile');
  await p.locator('.tabbar button').nth(1).tap(); await p.waitForTimeout(200);
  await p.locator('.tabbar button').nth(0).tap(); await p.waitForTimeout(200);
  check('iPhone path: one switch tick per tap', (await p.evaluate(() => window.__ticks)) === 2, String(await p.evaluate(() => window.__ticks)));
  check('hidden switch never keeps focus', await p.evaluate(() => !document.activeElement?.closest?.('[data-haptic-el]')));
  const tabStill = await p.evaluate(() => document.querySelector('.tabbar [aria-selected=true]').textContent);
  check('taps still do their job', tabStill === 'Play');
  check('no page errors', errs.length === 0, errs.join(' | '));
  await c.close();
}
console.log(out.join('\n'));
await b.close();
