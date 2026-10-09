// Keeping the recording upright in both landscape directions.
//
// iOS doesn't document whether camera frames handed to the page are already
// rotated to match how the phone is held. So we learn it from the frames:
//   follows      frames turn with the phone (landscape frames in landscape,
//                portrait frames in portrait). Nothing to do.
//   landscapeRaw frames are always landscape, fixed to one way round. The
//                other landscape direction comes out upside down: rotate 180.
//   portraitRaw  frames are always portrait: rotate 90 one way or the other.
// Plus a manual "Flip recorded video" in Settings for any phone that still
// gets it wrong. Pure functions; tested in videoOrientation.test.ts.

export type FrameMode = 'follows' | 'landscapeRaw' | 'portraitRaw';

/** Screen orientation angle: 0 portrait, 90 or 270 landscape. */
export function screenAngle(): number {
  try {
    const a = screen.orientation?.angle;
    if (typeof a === 'number') return ((a % 360) + 360) % 360;
  } catch {
    /* ignore */
  }
  const w = (window as any).orientation;
  return typeof w === 'number' ? ((w % 360) + 360) % 360 : 0;
}

/**
 * What a frame's shape says about the mode, or null if it can't tell.
 * Landscape frames while the phone is landscape fit both "follows" and
 * "landscapeRaw", so that case is ambiguous; portrait reveals it.
 */
export function inferMode(vw: number, vh: number, landscape: boolean): FrameMode | null {
  if (!vw || !vh || Math.abs(vw - vh) < 8) return null;
  const frameLandscape = vw > vh;
  if (landscape && !frameLandscape) return 'portraitRaw';
  if (!landscape && frameLandscape) return 'landscapeRaw';
  if (!landscape && !frameLandscape) return 'follows';
  return null;
}

/** Degrees to rotate a frame (clockwise) so it reads upright. */
export function frameRotation(mode: FrameMode, angle: number, flip: boolean): number {
  let r = 0;
  if (mode === 'landscapeRaw') r = angle === 270 ? 180 : 0;
  else if (mode === 'portraitRaw') r = angle === 270 ? 90 : 270;
  if (flip) r += 180;
  return r % 360;
}
