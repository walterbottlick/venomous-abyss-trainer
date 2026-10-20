import { describe, expect, it } from 'vitest';
import { CLASSES, classesFor } from './classes';

describe('CLASSES', () => {
  it('gives every class a distinct colour', () => {
    const colors = Object.values(CLASSES).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('classesFor', () => {
  it('lists only classes with a healer spec for healers', () => {
    const ids = classesFor('healer').map((c) => c.id);
    expect(ids).toContain('priest');
    expect(ids).not.toContain('rogue');
  });

  it('separates melee and ranged dps', () => {
    expect(classesFor('dps', 'melee').map((c) => c.id)).toContain('rogue');
    expect(classesFor('dps', 'ranged').map((c) => c.id)).not.toContain('rogue');
    expect(classesFor('dps', 'ranged').map((c) => c.id)).toContain('mage');
  });
});
