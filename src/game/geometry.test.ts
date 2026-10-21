import { describe, expect, it } from 'vitest';
import {
  clampToArea,
  closestPointOnPolygon,
  distance,
  distanceToPolygon,
  lerp,
  pointInPolygon,
  pushOutOfCircle,
  pushOutOfPolygon,
  towards,
} from './geometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('geometry', () => {
  it('lerps between points', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 30, y: 60 }, 2 / 3)).toEqual({ x: 20, y: 40 });
  });

  it('moves toward a point by a length', () => {
    expect(towards({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
  });

  it('knows whether a point is inside a polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
  });

  it('finds the closest point on a polygon edge', () => {
    expect(closestPointOnPolygon({ x: 15, y: 5 }, square)).toEqual({ x: 10, y: 5 });
  });

  it('measures distance to a polygon, zero inside', () => {
    expect(distanceToPolygon({ x: 5, y: 5 }, square)).toBe(0);
    expect(distanceToPolygon({ x: 14, y: 5 }, square)).toBe(4);
  });

  it('pushes a point inside a polygon out past its edge by the margin', () => {
    const out = pushOutOfPolygon({ x: 8, y: 5 }, square, 3);
    expect(pointInPolygon(out, square)).toBe(false);
    expect(distanceToPolygon(out, square)).toBeCloseTo(3);
  });

  it('pushes a point that is outside but too close out to the margin', () => {
    const out = pushOutOfPolygon({ x: 11, y: 5 }, square, 3);
    expect(distanceToPolygon(out, square)).toBeCloseTo(3);
  });

  it('leaves a point that is already clear alone', () => {
    const point = { x: 30, y: 30 };
    expect(pushOutOfPolygon(point, square, 3)).toBe(point);
  });

  it('pushes a point out of a circle, and leaves one outside alone', () => {
    const centre = { x: 0, y: 0 };
    const out = pushOutOfCircle({ x: 3, y: 0 }, centre, 10);
    expect(distance(out, centre)).toBeCloseTo(10);
    const far = { x: 50, y: 0 };
    expect(pushOutOfCircle(far, centre, 10)).toBe(far);
  });

  it('keeps a point, and room for an icon around it, inside an area', () => {
    expect(clampToArea({ x: 300, y: 700 }, 690, 540, 12)).toEqual({ x: 300, y: 528 });
    expect(clampToArea({ x: -50, y: -5 }, 690, 540, 12)).toEqual({ x: 12, y: 12 });
    expect(clampToArea({ x: 900, y: 100 }, 690, 540, 12)).toEqual({ x: 678, y: 100 });
    const inside = { x: 100, y: 100 };
    expect(clampToArea(inside, 690, 540, 12)).toEqual(inside);
  });
});
