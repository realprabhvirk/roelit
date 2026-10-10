import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const b = await chromium.launch();
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const c = await b.newContext({ ...devices['iPhone 13'], viewport: vp });
  await c.addInitScript(() => localStorage.setItem('roelit:installDismissed', 'true'));
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForSelector('.deck-tile');
  const crew = p.locator('.deck-tile', { hasText: 'SPORRENCESON' });
  await crew.scrollIntoViewIfNeeded(); await crew.tap(); await p.waitForTimeout(700);
  const boxes = {};
  for (const k of '0123456789') { const bx = await p.locator('.sheet-root.open .key', { hasText: new RegExp('^' + k + '$') }).boundingBox(); boxes[k] = [bx.x + bx.width / 2, bx.y + bx.height / 2]; }
  const type = async (code, gap) => { for (const d of code) { await p.touchscreen.tap(...boxes[d]); await p.waitForTimeout(gap); } };
  // Wrong code, very fast: all 6 must register (shake), then reset.
  await type('123456', 20);
  const dotsAfterWrong = await p.locator('.pin-dots span.on').count();
  await p.waitForTimeout(2200);
  const dotsReset = await p.locator('.pin-dots span.on').count();
  // Right code, very fast.
  await type(process.env.CREW_CODE, 20);
  await p.waitForTimeout(2500);
  const unlocked = !!(await p.$('.sheet-root.open .deck-hero'));
  console.log(`${vp.width}x${vp.height}: wrong code registered ${dotsAfterWrong}/6, reset to ${dotsReset}, fast right code unlocked: ${unlocked}, errors: ${errs.length}`);
  await c.close();
}
await b.close();
// Old code must not open it.
{
  const b2 = await (await import('/opt/node22/lib/node_modules/playwright/index.mjs')).chromium.launch();
  const c = await b2.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await c.addInitScript(() => localStorage.setItem('roelit:installDismissed', 'true'));
  const p = await c.newPage(); await p.goto(url); await p.waitForSelector('.deck-tile');
  const crew = p.locator('.deck-tile', { hasText: 'SPORRENCESON' }); await crew.scrollIntoViewIfNeeded(); await crew.tap(); await p.waitForTimeout(700);
  for (const d of process.env.CREW_CODE) { await p.locator('.sheet-root.open .key', { hasText: new RegExp('^' + d + '$') }).tap(); await p.waitForTimeout(40); }
  await p.waitForTimeout(2500);
  console.log('old 6-digit code -> still waiting for more digits (not unlocked):', !(await p.$('.sheet-root.open .deck-hero')), '| dots filled', await p.locator('.pin-dots span.on').count(), 'of', await p.locator('.pin-dots span').count());
  await b2.close();
}
