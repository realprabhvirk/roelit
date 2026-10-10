// Passcode lock for a deck's cards. The cards are AES-GCM encrypted with a key
// derived from the passcode (PBKDF2-SHA256), so the repo and the deployed
// bundle only ever contain scrambled data. Pure and framework-free: the lock
// script (scripts/crew.mjs) imports this same file, so both sides always agree.
// Keep to erasable TypeScript (no enums / parameter properties) so Node can run it directly.

export type Sealed = { v: 1; iter: number; salt: string; iv: string; data: string };

export const ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(u8: Uint8Array): string {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(code: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(plain: string, code: string, iter = ITERATIONS): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt, iter);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  return { v: 1, iter, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** Returns the plaintext, or null if the code is wrong (or the data was tampered with). */
export async function open(sealed: Sealed, code: string): Promise<string | null> {
  try {
    const key = await deriveKey(code, unb64(sealed.salt), sealed.iter);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.data));
    return dec.decode(out);
  } catch {
    return null;
  }
}
