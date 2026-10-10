import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const URL = process.argv[2];
const SP = './shots';
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`);
const savePng = (dataUrl, name) => writeFileSync(`${SP}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));

const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, acceptDownloads: true, permissions: ['camera', 'microphone'] });
await c.addInitScript(() => {
  localStorage.setItem('roelit:installDismissed', 'true');
  localStorage.setItem('roelit:micAsked', 'true');
  localStorage.setItem('roelit:settings', JSON.stringify({ roundLength: 30, voice: true }));
  // Count recognisers: none should start in a recorded round.
  window.__sr = 0;
  class FakeSR { start() { window.__sr++; setTimeout(() => this.onstart?.(), 30); } abort() { setTimeout(() => this.onend?.(), 20); } stop() { this.abort(); } }
  window.webkitSpeechRecognition = FakeSR;
});
const p = await c.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(URL);
await p.waitForSelector('.deck-tile');
await p.locator('.deck-tile').first().tap();
await p.waitForTimeout(600);
await p.locator('.sheet-root.open .btn-primary').tap();
await p.waitForTimeout(600);
const voiceBefore = await p.evaluate(() => window.__sr);

// 1. Toggle recording on: camera preview replaces the illustration.
await p.locator('.rec-toggle').tap();
await p.waitForSelector('.pre-preview', { timeout: 5000 }).catch(() => {});
await p.waitForTimeout(800);
check('toggle turns recording on', /Recording on/.test(await p.textContent('.rec-toggle')));
check('live camera preview shown', !!(await p.$('.pre-preview')));
await p.screenshot({ path: `${SP}/70-pre-record.png` });

// 2. Start the round: REC shows, no voice recogniser.
await p.locator('.pre-actions .btn-primary').tap();
await p.waitForTimeout(1500);
const grab = (name) =>
  p.evaluate(() => [...document.querySelectorAll('body > div canvas')].find((cv) => cv.width === 1280)?.toDataURL('image/png')).then((d) => d && savePng(d, name));
await grab('71-overlay-countdown');
await p.waitForTimeout(2600);
check('REC indicator on the round', !!(await p.$('.round-rec')));
await grab('72-overlay-playing');
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(150);
await grab('73-overlay-correct');
await p.waitForTimeout(800);
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(150);
await grab('74-overlay-pass');
check('no voice recogniser during a recorded round', (await p.evaluate(() => window.__sr)) === voiceBefore, `started ${await p.evaluate(() => window.__sr)} vs ${voiceBefore}`);
await p.screenshot({ path: `${SP}/75-round-rec.png` });

// 3. Let it run out: the end card, then results with a playable clip.
await p.waitForSelector('.time-up', { timeout: 40000 });
await p.waitForTimeout(300);
await grab('76-overlay-time');
await p.waitForSelector('.results', { timeout: 5000 });
await p.waitForSelector('.clip-card video', { timeout: 8000 }).catch(() => {});
const info = await p.evaluate(async () => {
  const v = document.querySelector('.clip-card video');
  if (!v) return null;
  const blob = await fetch(v.src).then((r) => r.blob());
  return { size: blob.size, type: blob.type };
});
check('clip ready on results', !!info && info.size > 50_000, JSON.stringify(info));
await p.screenshot({ path: `${SP}/77-results-clip.png` });

// Pull a frame out of the actual recorded file to prove the overlay is baked in.
const frame = await p.evaluate(async () => {
  const src = document.querySelector('.clip-card video').src;
  const v = document.createElement('video');
  v.muted = true;
  v.src = src;
  await new Promise((r) => (v.onloadeddata = r));
  // webm from MediaRecorder has no duration until scanned; seek far to force it.
  v.currentTime = 1e6;
  await new Promise((r) => (v.onseeked = r));
  const dur = v.duration;
  v.currentTime = Math.max(0, dur * 0.4);
  await new Promise((r) => (v.onseeked = r));
  const cv = document.createElement('canvas');
  cv.width = v.videoWidth;
  cv.height = v.videoHeight;
  cv.getContext('2d').drawImage(v, 0, 0);
  return { dur, w: v.videoWidth, h: v.videoHeight, png: cv.toDataURL('image/png') };
});
savePng(frame.png, '78-recorded-frame');
check('recording is 1280x720 and ~30s+', frame.w === 1280 && frame.h === 720 && frame.dur > 28, `${frame.w}x${frame.h} ${frame.dur.toFixed?.(1)}s`);

// 4. Leaving without saving warns first.
await p.locator('.results-actions .btn-secondary').tap();
await p.waitForTimeout(300);
check('first leave tap warns about unsaved video', !!(await p.$('.clip-note.warn')) && !!(await p.$('.results')));

// 5. Save (no share sheet in desktop Chrome, so it downloads).
const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await p.locator('.clip-actions .btn-primary').tap();
const d = await dl;
check('Save hands over the file', !!d, d ? d.suggestedFilename() : '');
await p.waitForTimeout(300);
check('button shows Saved', /Saved/.test(await p.textContent('.clip-actions .btn-primary')));

// 6. Now leaving is one tap and frees the camera.
await p.locator('.results-actions .btn-secondary').tap();
await p.waitForTimeout(500);
check('leaves after saving', !(await p.$('.results')));
await c.close();

// 7. Quit mid-round: clip binned, camera released.
{
  const c2 = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, permissions: ['camera', 'microphone'] });
  await c2.addInitScript(() => {
    localStorage.setItem('roelit:installDismissed', 'true');
    localStorage.setItem('roelit:micAsked', 'true');
    localStorage.setItem('roelit:settings', JSON.stringify({ roundLength: 30, voice: false, record: true }));
  });
  const q = await c2.newPage();
  await q.goto(URL);
  await q.waitForSelector('.deck-tile');
  await q.locator('.deck-tile', { hasText: 'Animals' }).tap();
  await q.waitForTimeout(600);
  await q.locator('.sheet-root.open .btn-primary').tap(); // record remembered: camera starts from this tap
  await q.waitForSelector('.pre-preview', { timeout: 5000 }).catch(() => {});
  check('remembered setting starts camera from the Start tap', !!(await q.$('.pre-preview')));
  await q.locator('.pre-actions .btn-primary').tap();
  await q.waitForTimeout(5000);
  await q.keyboard.press('Escape');
  await q.waitForTimeout(400);
  await q.screenshot({ path: './shots/80-end-confirm.png' });
  check('quit mid-round asks first', !!(await q.$('.quit-confirm')));
  await q.locator('.quit-actions .btn-primary').tap();
  await q.waitForSelector('.clip-card video', { timeout: 8000 }).catch(() => {});
  check('ending early keeps the clip', !!(await q.$('.clip-card video')));
  await c2.close();
}

check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(out.join('\n'));
await b.close();
