import { describe, expect, it } from 'vitest';
import { ringArc } from './ring';

const TOP = -Math.PI / 2;

describe('ringArc', () => {
  it('is a full circle from the top at full health', () => {
    const arc = ringArc(1)!;
    expect(arc.start).toBeCloseTo(TOP);
    expect(arc.end - arc.start).toBeCloseTo(Math.PI * 2);
  });

  it('always ends at the top, so the missing part opens up clockwise from there', () => {
    for (const f of [0.9, 0.5, 0.1]) {
      expect(ringArc(f)!.end).toBeCloseTo(TOP + Math.PI * 2);
    }
  });

  it("loses the top-right quarter first: at 75% the arc starts at 3 o'clock", () => {
    expect(ringArc(0.75)!.start).toBeCloseTo(0);
  });

  it('moves the start clockwise as health drops and back as it is healed', () => {
    expect(ringArc(0.5)!.start).toBeGreaterThan(ringArc(0.75)!.start);
    expect(ringArc(0.75)!.start).toBeGreaterThan(ringArc(0.9)!.start);
  });

  it('draws nothing at zero health, and clamps out-of-range values', () => {
    expect(ringArc(0)).toBeNull();
    expect(ringArc(-1)).toBeNull();
    expect(ringArc(5)!.start).toBeCloseTo(TOP);
  });
});
