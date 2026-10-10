import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2]; const N = +process.argv[3] || 300; const seedArg = +process.argv[4] || 1;
let seed = seedArg; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const b = await chromium.launch();
const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
await c.addInitScript(() => { localStorage.setItem('roelit:installDismissed', 'true'); localStorage.setItem('roelit:settings', JSON.stringify({ roundLength: 30 })); });
const p = await c.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(url); await p.waitForSelector('.deck-tile');
const cdp = await c.newCDPSession(p);
const swipe = async (x, y1, y2) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y1 + ((y2 - y1) * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const log = []; let problems = [];
async function probe(step) {
  // Get back to the tab shell, then check tabs switch and the list scrolls.
  for (let i = 0; i < 4; i++) {
    const onTabs = await p.evaluate(() => !document.querySelector('.fullscreen') && !document.querySelector('.sheet-root.open'));
    if (onTabs) break;
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    if (await p.$('.sheet-root.open')) { await p.touchscreen.tap(195, 10); await p.waitForTimeout(500); }
    const x = await p.$('.fullscreen .close-btn, .fullscreen [aria-label="End round"], .sheet-root.open .btn-plain');
    if (x) { await x.tap().catch(() => {}); await p.waitForTimeout(500); }
  }
  const onTabs = await p.evaluate(() => !document.querySelector('.fullscreen') && !document.querySelector('.sheet-root.open'));
  if (!onTabs) {
    const where = await p.evaluate(() => {
      const fs = document.querySelector('.fullscreen'); const sh = document.querySelector('.sheet-root.open');
      return { fullscreen: fs?.className, sheet: sh?.querySelector('h2')?.textContent, text: (sh || fs)?.textContent.slice(0, 120) };
    });
    await p.screenshot({ path: `./stuck-${seedArg}-${step}.png` });
    problems.push(`step ${step}: could not get back to tabs ${JSON.stringify(where)} (last: ${log.slice(-6).join(' | ')})`); return;
  }
  for (const i of [1, 0]) {
    const bx = await p.locator('.tabbar button').nth(i).boundingBox();
    await p.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(250);
    const sel = await p.evaluate((i) => document.querySelectorAll('.tabbar button')[i].getAttribute('aria-selected'), i);
    if (sel !== 'true') problems.push(`step ${step}: tab ${i} tap ignored (last: ${log.slice(-4).join(' | ')})`);
  }
  await p.evaluate(() => (document.querySelector('.tab-view:not([hidden])').scrollTop = 0));
  await swipe(200, 600, 200); await p.waitForTimeout(250);
  const st = await p.evaluate(() => document.querySelector('.tab-view:not([hidden])').scrollTop);
  if (st < 20) problems.push(`step ${step}: list won't scroll (scrollTop ${st}) (last: ${log.slice(-4).join(' | ')})`);
}
for (let step = 0; step < N; step++) {
  const targets = await p.evaluate(() => {
    const top = document.querySelector('.sheet-root.open .sheet') || document.querySelector('.fullscreen') || document;
    return [...top.querySelectorAll('button, .switch, [role=radio]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
      .map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) }; });
  });
  const r = rnd();
  if (r < 0.06) { await p.setViewportSize(rnd() < 0.5 ? { width: 844, height: 390 } : { width: 390, height: 844 }); log.push('rotate'); }
  else if (r < 0.12) { await p.keyboard.press(rnd() < 0.5 ? 'ArrowDown' : 'ArrowUp'); log.push('arrow'); }
  else if (targets.length) { const t = targets[Math.floor(rnd() * targets.length)]; if (/reset|wipe/i.test(t.t)) continue; await p.touchscreen.tap(t.x, t.y); log.push(t.t || '?'); }
  await p.waitForTimeout(40 + rnd() * 400);
  if (step % 40 === 39) { await p.setViewportSize({ width: 390, height: 844 }); await probe(step); }
}
console.log(JSON.stringify({ seed: seedArg, problems: problems.slice(0, 10), errors: [...new Set(errors)].slice(0, 10) }, null, 1));
await b.close();
