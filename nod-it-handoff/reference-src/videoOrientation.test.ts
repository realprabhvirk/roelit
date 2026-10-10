import { describe, expect, it } from 'vitest';
import { frameRotation, inferMode } from './videoOrientation';

describe('inferMode', () => {
  it('portrait phone + portrait frames: frames follow the phone', () => {
    expect(inferMode(720, 1280, false)).toBe('follows');
  });
  it('portrait phone + landscape frames: fixed landscape sensor frames', () => {
    expect(inferMode(1280, 720, false)).toBe('landscapeRaw');
  });
  it('landscape phone + portrait frames: fixed portrait frames', () => {
    expect(inferMode(720, 1280, true)).toBe('portraitRaw');
  });
  it('landscape phone + landscape frames: can not tell yet', () => {
    expect(inferMode(1280, 720, true)).toBeNull();
  });
  it('ignores missing or square sizes', () => {
    expect(inferMode(0, 0, true)).toBeNull();
    expect(inferMode(640, 640, false)).toBeNull();
  });
});

describe('frameRotation', () => {
  it('frames that follow the phone need nothing, either way round', () => {
    expect(frameRotation('follows', 90, false)).toBe(0);
    expect(frameRotation('follows', 270, false)).toBe(0);
  });
  it('fixed landscape frames: the flipped direction gets turned 180', () => {
    expect(frameRotation('landscapeRaw', 90, false)).toBe(0);
    expect(frameRotation('landscapeRaw', 270, false)).toBe(180);
  });
  it('fixed portrait frames: quarter turn, opposite for each side', () => {
    expect(frameRotation('portraitRaw', 90, false)).toBe(270);
    expect(frameRotation('portraitRaw', 270, false)).toBe(90);
  });
  it('the manual flip adds a half turn on top', () => {
    expect(frameRotation('follows', 90, true)).toBe(180);
    expect(frameRotation('landscapeRaw', 270, true)).toBe(0);
    expect(frameRotation('portraitRaw', 90, true)).toBe(90);
  });
});
