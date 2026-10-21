import type { Vec2 } from '../game/movement';

/**
 * Positions for `count` icons packed tightly around `center`, in rings (1 in the middle, then 6,
 * then 12...) spaced `spacing` apart, so nobody overlaps. The first position is the centre.
 * Used for the raid's starting huddle before a fight.
 */
export function clumpPositions(center: Vec2, count: number, spacing: number): Vec2[] {
  const positions: Vec2[] = [];
  for (let ring = 0; positions.length < count; ring++) {
    if (ring === 0) {
      positions.push({ ...center });
      continue;
    }
    const inRing = ring * 6;
    // A tilt per ring keeps the rings from lining up into spokes.
    const tilt = ring * 0.35;
    for (let i = 0; i < inRing && positions.length < count; i++) {
      const angle = tilt + (i / inRing) * Math.PI * 2;
      positions.push({
        x: center.x + Math.cos(angle) * spacing * ring,
        y: center.y + Math.sin(angle) * spacing * ring,
      });
    }
  }
  return positions;
}
