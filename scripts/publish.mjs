// Copies the built site from dist/ to the repo root, so the repo itself is a
// working static site. Old build files at the root are removed first.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing, run vite build first');

const stale = ['index.html', 'assets', 'icons', 'sw.js', 'manifest.webmanifest', 'registerSW.js'];
for (const name of readdirSync(root)) {
  if (stale.includes(name) || /^workbox-.*\.js$/.test(name)) rmSync(join(root, name), { recursive: true, force: true });
}
for (const name of readdirSync(dist)) cpSync(join(dist, name), join(root, name), { recursive: true });
console.log('published dist/ to repo root');
