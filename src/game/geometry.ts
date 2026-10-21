import type { Vec2 } from './movement';

/** Small helpers for points, circles and polygons. Pure, so they are easy to test. */

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** A point `length` away from `from`, in the direction of `to` (or straight down if they match). */
export function towards(from: Vec2, to: Vec2, length: number): Vec2 {
  const d = distance(from, to);
  if (d < 1e-9) return { x: from.x, y: from.y + length };
  return { x: from.x + ((to.x - from.x) / d) * length, y: from.y + ((to.y - from.y) / d) * length };
}

/** Whether `point` is inside `polygon` (a list of corners, in order). */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** The closest point to `point` on the edge of `polygon`. */
export function closestPointOnPolygon(point: Vec2, polygon: readonly Vec2[]): Vec2 {
  let best: Vec2 = polygon[0]!;
  let bestDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSquared = abx * abx + aby * aby;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared));
    const candidate = { x: a.x + abx * t, y: a.y + aby * t };
    const d = distance(point, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** How far `point` is from the edge of `polygon`; 0 inside it. */
export function distanceToPolygon(point: Vec2, polygon: readonly Vec2[]): number {
  return pointInPolygon(point, polygon)
    ? 0
    : distance(point, closestPointOnPolygon(point, polygon));
}

/**
 * If `point` is inside `polygon`, or closer to it than `margin`, returns the nearest point that is
 * `margin` clear of it. Otherwise returns `point` unchanged.
 */
export function pushOutOfPolygon(point: Vec2, polygon: readonly Vec2[], margin: number): Vec2 {
  const inside = pointInPolygon(point, polygon);
  const edge = closestPointOnPolygon(point, polygon);
  const d = distance(point, edge);
  if (!inside && d >= margin) return point;
  // Head away from the edge: outward if we were outside, toward the edge and past it if inside.
  const outward = inside ? edge : point;
  const reference = inside ? point : edge;
  const away = towards(reference, outward, 1);
  const dx = away.x - reference.x;
  const dy = away.y - reference.y;
  return { x: edge.x + dx * margin, y: edge.y + dy * margin };
}

/** If `point` is within `radius` of `center`, the nearest point exactly `radius` away; else `point`. */
export function pushOutOfCircle(point: Vec2, center: Vec2, radius: number): Vec2 {
  if (distance(point, center) >= radius) return point;
  return towards(center, point, radius);
}

/**
 * Pulls `point` back inside a `width` x `height` area (with its top-left at 0, 0), keeping
 * `margin` clear of every edge so a round icon of that radius stays fully inside.
 */
export function clampToArea(point: Vec2, width: number, height: number, margin: number): Vec2 {
  return {
    x: Math.min(width - margin, Math.max(margin, point.x)),
    y: Math.min(height - margin, Math.max(margin, point.y)),
  };
}
