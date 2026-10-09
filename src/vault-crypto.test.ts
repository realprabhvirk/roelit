import { describe, expect, it } from 'vitest';
import { open, seal } from './vault-crypto';

// Low iteration count: the maths is identical, the tests just run faster.
const FAST = 1000;
const PLAIN = JSON.stringify(['Alpha Person', 'Beta Person']);

describe('vault-crypto', () => {
  it('opens with the right code', async () => {
    const s = await seal(PLAIN, '123456', FAST);
    expect(await open(s, '123456')).toBe(PLAIN);
  });

  it('refuses a wrong code', async () => {
    const s = await seal(PLAIN, '123456', FAST);
    expect(await open(s, '123457')).toBeNull();
    expect(await open(s, '')).toBeNull();
  });

  it('refuses tampered data', async () => {
    const s = await seal(PLAIN, '123456', FAST);
    const bad = { ...s, data: s.data.slice(0, -4) + 'AAAA' };
    expect(await open(bad, '123456')).toBeNull();
  });

  it('never stores the plaintext, and salts every seal differently', async () => {
    const a = await seal(PLAIN, '123456', FAST);
    const b = await seal(PLAIN, '123456', FAST);
    expect(JSON.stringify(a)).not.toContain('Alpha');
    expect(a.salt).not.toBe(b.salt);
    expect(a.data).not.toBe(b.data);
  });
});
