import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const b = await chromium.launch();
const c = await b.newContext({ ...devices['iPhone 13'] });
await c.addInitScript(() => localStorage.setItem('roelit:installDismissed', 'true'));
const p = await c.newPage();
await p.goto(url); await p.waitForSelector('.deck-tile'); await p.waitForTimeout(300);
const center = async (sel) => { const r = await p.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
const tab = () => p.evaluate(() => document.querySelector('.tabbar [aria-selected=true]').textContent);

// 1) two quick taps on different tabs, 200ms apart
await p.touchscreen.tap(...await center('.tabbar button >> nth=1'));
await p.waitForTimeout(200);
await p.touchscreen.tap(...await center('.tabbar button >> nth=2'));
await p.waitForTimeout(300);
console.log('quick taps -> expected Settings, got:', await tab());

await p.waitForTimeout(600);
// 2) close a sheet, then tap a tab 150ms later
await p.touchscreen.tap(...await center('.tabbar button >> nth=0')); await p.waitForTimeout(500);
await p.touchscreen.tap(...await center('.deck-tile')); await p.waitForTimeout(700);
await p.touchscreen.tap(195, 60); // scrim -> close sheet
await p.waitForTimeout(150);
await p.touchscreen.tap(...await center('.tabbar button >> nth=1'));
await p.waitForTimeout(300);
console.log('tap right after sheet close -> expected Decks, got:', await tab());
await b.close();
