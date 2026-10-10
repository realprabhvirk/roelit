import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const SP = '.';
const browser = await chromium.launch();
const errors = [];
async function page() {
  const c = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 } });
  await c.addInitScript(() => { localStorage.setItem('roelit:installDismissed','true'); localStorage.setItem('roelit:settings', JSON.stringify({voice:false, roundLength:30})); });
  const p = await c.newPage();
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto('http://localhost:4199/'); await p.waitForTimeout(400);
  return { c, p };
}
const feed = (p, beta, gamma, ms) => p.evaluate(async ([b, g, ms]) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: g, alpha: 0 }));
    await new Promise(r => setTimeout(r, 16));
  }
}, [beta, gamma, ms]);

for (const [name, pose] of Object.entries({
  topLeft: { n: [0, -90], down: [180, 45], up: [0, -45] },
  topRight: { n: [180, -90], down: [180, -45], up: [0, 45] },
})) {
  const { c, p } = await page();
  await p.click('.deck-tile >> nth=0'); await p.waitForTimeout(500);
  await p.click('text=Start'); await p.waitForTimeout(400);
  // auto-start: wait out the grace period, lift from a reading angle, hold upright
  await p.waitForTimeout(2600);
  await feed(p, pose.up[0], pose.up[1], 500);
  await feed(p, ...pose.n, 1400);
  const inRound = await p.$('.round');
  // countdown 3s with neutral samples (calibration)
  await feed(p, ...pose.n, 3200);
  const s0 = await p.textContent('.round-score b');
  await feed(p, ...pose.down, 400);
  await feed(p, ...pose.n, 900);
  const s1 = await p.textContent('.round-score b');
  // shake-ish jitter around neutral: small wobble
  for (let i = 0; i < 20; i++) await feed(p, pose.n[0], pose.n[1] + (i % 2 ? 12 : -12) * Math.sign(-pose.n[1]), 40);
  const s2 = await p.textContent('.round-score b');
  await feed(p, ...pose.up, 400);
  await feed(p, ...pose.n, 900);
  // held down a long time: one point only
  await feed(p, ...pose.down, 1500);
  await feed(p, ...pose.n, 900);
  const s3 = await p.textContent('.round-score b');
  await p.keyboard.press('Escape');
  console.log(name, { autoStarted: !!inRound, s0, s1, s2, s3 });
  await c.close();
}

// Import
{
  const { c, p } = await page();
  await p.click('.tabbar button >> nth=1'); await p.waitForTimeout(300);
  await p.setInputFiles('input[type=file]', `${SP}/bad.json`); await p.waitForTimeout(600);
  console.log('bad import:', await p.textContent('.error-box'));
  await p.screenshot({ path: `${SP}/shots/40-import-error.png` });
  await p.click('text=OK'); await p.waitForTimeout(500);
  await p.setInputFiles('input[type=file]', './test-deck.json'); await p.waitForTimeout(600);
  console.log('deck import:', await p.textContent('.sheet .prose'));
  await p.click('text=OK'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${SP}/shots/41-decks-with-crew.png` });
  await p.click('.tabbar button >> nth=0'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.tab-view:not([hidden])').scrollTop = 2000); await p.waitForTimeout(300);
  await p.screenshot({ path: `${SP}/shots/42-play-crew.png` });
  await c.close();
}
console.log('ERRORS', errors);
await browser.close();
