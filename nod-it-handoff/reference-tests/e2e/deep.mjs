import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.argv[2];
const SP = '.';
const b = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };

// Fake SpeechRecognition the test can drive: say(), end(), slow starts.
const FAKE = ({ standalone, startDelay }) => {
  localStorage.setItem('roelit:installDismissed', 'true');
  localStorage.setItem('roelit:micAsked', 'true');
  localStorage.setItem('roelit:settings', JSON.stringify({ roundLength: 30, voice: true }));
  window.__sr = { instances: [], startDelay };
  class FakeSR {
    constructor() { window.__sr.instances.push(this); this.alive = false; }
    start() { this.alive = true; setTimeout(() => this.alive && this.onstart?.(), window.__sr.startDelay); }
    abort() { if (!this.alive) return; this.alive = false; setTimeout(() => this.onend?.(), 30); }
    stop() { this.abort(); }
    say(text) {
      const r = [{ transcript: text }]; r.isFinal = true;
      this.onresult?.({ results: [r], resultIndex: 0 });
    }
    end() { this.alive = false; this.onend?.(); }
  }
  window.webkitSpeechRecognition = FakeSR;
  window.SpeechRecognition = FakeSR;
  if (standalone) {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    navigator.permissions.query = async () => ({ state: 'prompt' });
  }
};

async function page(opts) {
  const c = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 } });
  await c.addInitScript(FAKE, opts);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL);
  await p.waitForSelector('.deck-tile');
  return { c, p, errs };
}
const live = (p) => p.evaluate(() => window.__sr.instances.filter((i) => i.alive).length);
const count = (p) => p.evaluate(() => window.__sr.instances.length);

async function startRound(p) {
  await p.locator('.deck-tile').first().tap();
  await p.waitForTimeout(600);
  await p.locator('.sheet-root.open .btn-primary').tap();
  await p.waitForTimeout(500);
  await p.locator('.pre-actions .btn-primary').tap();
  await p.waitForTimeout(3600);
}

// ---------- A: browser mode, voice matches the card and restarts itself ----------
{
  const { c, p, errs } = await page({ standalone: false, startDelay: 50 });
  await startRound(p);
  check('A one recogniser running in round', (await live(p)) === 1, `live=${await live(p)}`);
  const word = await p.evaluate(() => document.querySelector('.word')?.textContent.replace(/\n/g, ' ').toLowerCase());
  await p.waitForTimeout(900); // past the 800ms debounce
  await p.evaluate((w) => window.__sr.instances.at(-1).say('is it ' + w), word);
  await p.waitForTimeout(150);
  check('A saying the word scores', (await p.textContent('.round-score b')) === '1', `word=${word}`);
  const before = await count(p);
  await p.evaluate(() => window.__sr.instances.at(-1).end()); // iOS ends the session
  await p.waitForTimeout(1200);
  check('A restarts after iOS ends it', (await count(p)) === before + 1 && (await live(p)) === 1);
  check('A pill says Listening', /Listening/.test(await p.textContent('.mic-pill')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.locator('.quit-actions .btn-primary').tap();
  await p.waitForTimeout(1500);
  check('A mic released after ending the round', (await live(p)) === 0);
  check('A no page errors', errs.length === 0, errs.join(' | '));
  await c.close();
}

// ---------- B: home-screen mode, slow (prompted) start: no surprise restart, tap to resume ----------
{
  const { c, p, errs } = await page({ standalone: true, startDelay: 1500 });
  await startRound(p);
  await p.waitForTimeout(500);
  const before = await count(p);
  await p.evaluate(() => window.__sr.instances.at(-1).end());
  await p.waitForTimeout(1500);
  check('B no automatic restart after a prompted start', (await count(p)) === before);
  const pill = await p.$('button.mic-pill');
  check('B pill offers tap to resume', !!pill && /resume/i.test(await pill.textContent()));
  await pill?.tap();
  await p.waitForTimeout(2000);
  check('B tap brings voice back', (await count(p)) === before + 1 && /Listening/.test(await p.textContent('.mic-pill')));
  check('B no page errors', errs.length === 0, errs.join(' | '));
  await c.close();
}

// ---------- C: quitting during "Time!" must not jump to results later ----------
{
  const { c, p } = await page({ standalone: false, startDelay: 50 });
  await startRound(p);
  await p.waitForSelector('.time-up', { timeout: 40000 });
  await p.keyboard.press('Escape'); // round's over: nothing to confirm
  await p.waitForTimeout(2500);
  check('C Time! goes to results once, no confirm', !!(await p.$('.results')) && !(await p.$('.quit-confirm')));
  await c.close();
}

// ---------- D: viewport nudge snaps back; diagnostics log has the story ----------
{
  const { c, p } = await page({ standalone: false, startDelay: 50 });
  await p.setViewportSize({ width: 390, height: 844 });
  const y = await p.evaluate(async () => {
    const tall = document.createElement('div');
    tall.style.height = '3000px';
    document.body.appendChild(tall);
    for (const el of [document.documentElement, document.body]) { el.style.overflow = 'visible'; el.style.height = 'auto'; }
    window.scrollTo(0, 120);
    const moved = window.scrollY;
    await new Promise((r) => setTimeout(r, 300));
    const after = window.scrollY;
    tall.remove();
    for (const el of [document.documentElement, document.body]) { el.style.overflow = ''; el.style.height = ''; }
    return { moved, after };
  });
  check('D nudged window snaps back to 0', y.moved > 0 && y.after === 0, JSON.stringify(y));
  await p.locator('.tabbar button').nth(2).tap();
  await p.waitForTimeout(300);
  await p.locator('.row', { hasText: 'Diagnostics' }).tap();
  await p.waitForTimeout(700);
  const logText = await p.textContent('.log-view');
  check('D diagnostics shows the log', /screen|tab settings/.test(logText) && /viewport nudged/.test(logText) && /start v\d/.test(logText));
  await p.screenshot({ path: `${SP}/shots/60-diagnostics.png` });
  check('D no crew names or codes in log', !new RegExp(`${process.env.CREW_CODE || "x^"}|Chris|Perera`).test(logText));
  await c.close();
}

console.log(results.join('\n'));
await b.close();
