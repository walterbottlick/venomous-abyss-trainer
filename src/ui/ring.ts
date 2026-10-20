/** A section of a circle to stroke, in radians. Angle 0 points right; positive turns clockwise. */
export interface RingArc {
  start: number;
  end: number;
}

const FULL_TURN = Math.PI * 2;
const TOP = -Math.PI / 2;

/**
 * The part of a health ring that is still visible, for `fraction` of health left (0 to 1).
 *
 * The ring is full at the top (12 o'clock). As health drops, the missing part grows clockwise
 * from there, so the visible arc runs from the end of the missing part round to 12 o'clock.
 * Healing shrinks the missing part back the other way, counter-clockwise. Returns null when
 * nothing should be drawn.
 */
export function ringArc(fraction: number): RingArc | null {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) return null;
  return { start: TOP + (1 - f) * FULL_TURN, end: TOP + FULL_TURN };
}
