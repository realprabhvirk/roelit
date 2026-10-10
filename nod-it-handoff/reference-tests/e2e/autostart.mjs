import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const url = process.argv[2];
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, permissions: ['camera', 'microphone'] });
await c.addInitScript(() => { localStorage.setItem('roelit:installDismissed', 'true'); localStorage.setItem('roelit:settings', JSON.stringify({ voice: false, roundLength: 30 })); });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url); await p.waitForSelector('.deck-tile');
const feed = (beta, gamma, ms) => p.evaluate(async ([b, g, ms]) => { const end = performance.now() + ms; while (performance.now() < end) { window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: g, alpha: 0 })); await new Promise((r) => setTimeout(r, 16)); } }, [beta, gamma, ms]);
const UP = [0, -90], VIEW = [0, -40];
const inRound = async () => !!(await p.$('.round'));
await p.locator('.deck-tile', { hasText: 'Animals' }).tap(); await p.waitForTimeout(600);
await p.locator('.sheet-root.open .btn-primary').tap(); await p.waitForTimeout(300);
// 1. Holding it sideways and still from the start: must wait.
await feed(...UP, 5000);
check('held upright from the start: does not auto-start', !(await inRound()));
// 2. Lift from reading angle, but tap the record toggle while holding: still waits.
await feed(...VIEW, 500);
await feed(...UP, 300);
await p.locator('.rec-toggle').tap();
await feed(...UP, 2500);
check('tapping the video toggle pauses auto-start', !(await inRound()));
check('recording toggled on fine', /Recording on|Starting camera/.test(await p.textContent('.rec-toggle')));
await feed(...UP, 1500);
check('…and still not started while held upright without moving it again', !(await inRound()));
// 3. Proper lift after the pause: bar shows, then it starts.
await feed(...VIEW, 600);
console.log('after VIEW: inRound', await inRound(), 'screen', await p.evaluate(() => document.querySelector('.fullscreen')?.className));
await feed(...UP, 500);
console.log('after UP 500: inRound', await inRound(), await p.evaluate(() => document.querySelector('.fullscreen')?.textContent.slice(0, 120)));
const bar = !!(await p.$('.hold-bar'));
const txt = (await p.$('.pre-status')) ? await p.textContent('.pre-status') : '(no status)';
await feed(...UP, 900);
check('lifting onto the forehead shows the Starting bar', bar && /Starting/.test(txt), txt);
check('…then starts the round', await inRound());
check('…and the round is recording', !!(await p.$('.round-rec')));
check('no page errors', errs.length === 0, errs.join(' | '));
console.log(out.join('\n'));
await b.close();
