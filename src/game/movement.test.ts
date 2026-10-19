import { describe, expect, it } from 'vitest';
import { directionFromInput, step } from './movement';

const none = { left: false, right: false, up: false, down: false };
const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

describe('directionFromInput', () => {
  it('is zero with no keys held', () => {
    expect(directionFromInput(none)).toEqual({ x: 0, y: 0 });
  });

  it('cancels opposing keys', () => {
    expect(directionFromInput({ ...none, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });

  it('normalises diagonals so they are not faster', () => {
    const d = directionFromInput({ ...none, right: true, down: true });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
});

describe('step', () => {
  it('moves by speed * dt', () => {
    expect(step({ x: 10, y: 10 }, { x: 1, y: 0 }, 50, 0.5, bounds)).toEqual({ x: 35, y: 10 });
  });

  it('clamps to the bounds', () => {
    expect(step({ x: 95, y: 5 }, { x: 1, y: -1 }, 100, 1, bounds)).toEqual({ x: 100, y: 0 });
  });
});
