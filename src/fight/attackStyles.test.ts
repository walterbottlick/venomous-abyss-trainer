import { describe, expect, it } from 'vitest';
import { classesFor } from '../game/classes';
import { attackStyleFor, CLASS_ATTACK_STYLES, DEFAULT_ATTACK_STYLES } from './attackStyles';

describe('attack styles', () => {
  it('give every class and kind of DPS the menus offer its own animation', () => {
    for (const kind of ['melee', 'ranged'] as const) {
      for (const info of classesFor('dps', kind)) {
        expect(CLASS_ATTACK_STYLES[info.id][kind], `${info.id} ${kind}`).toBeDefined();
      }
    }
  });

  it('use a swipe or stab for melee classes and a projectile or beam for ranged ones', () => {
    for (const styles of Object.values(CLASS_ATTACK_STYLES)) {
      if (styles.melee) expect(['swipe', 'stab']).toContain(styles.melee.kind);
      if (styles.ranged) expect(['dot', 'star', 'arrow', 'beam']).toContain(styles.ranged.kind);
    }
  });

  it('use swipes for the death knight, demon hunter, paladin, shaman, warrior and monk', () => {
    for (const id of [
      'death-knight',
      'demon-hunter',
      'paladin',
      'warrior',
      'monk',
      'shaman',
    ] as const) {
      expect(attackStyleFor('melee', id).kind).toBe('swipe');
    }
  });

  it('use the double stab for the rogue, melee druid and melee hunter', () => {
    for (const id of ['rogue', 'druid', 'hunter'] as const) {
      expect(attackStyleFor('melee', id).kind).toBe('stab');
    }
  });

  it('use stars for the druid, evoker and mage, arrows for the hunter, shaman and warlock, and a beam for the priest', () => {
    for (const id of ['druid', 'evoker', 'mage'] as const) {
      expect(attackStyleFor('ranged', id).kind).toBe('star');
    }
    for (const id of ['hunter', 'shaman', 'warlock'] as const) {
      expect(attackStyleFor('ranged', id).kind).toBe('arrow');
    }
    expect(attackStyleFor('ranged', 'priest').kind).toBe('beam');
  });

  it('pick the style by kind of DPS for classes that can be both', () => {
    expect(attackStyleFor('melee', 'druid')).not.toEqual(attackStyleFor('ranged', 'druid'));
    expect(attackStyleFor('melee', 'hunter').kind).toBe('stab');
    expect(attackStyleFor('ranged', 'hunter').kind).toBe('arrow');
    expect(attackStyleFor('melee', 'shaman').kind).toBe('swipe');
    expect(attackStyleFor('ranged', 'shaman').kind).toBe('arrow');
  });

  it('keep the hunter arrow white and the shaman arrow red, as the same shape', () => {
    expect(attackStyleFor('ranged', 'hunter').color).toBe(0xffffff);
    expect(attackStyleFor('ranged', 'shaman').kind).toBe(attackStyleFor('ranged', 'hunter').kind);
    expect(attackStyleFor('ranged', 'shaman').color).not.toBe(0xffffff);
  });

  it('fall back to the white swipe and white dot for NPCs, who have no class', () => {
    expect(attackStyleFor('melee')).toEqual(DEFAULT_ATTACK_STYLES.melee);
    expect(attackStyleFor('ranged')).toEqual(DEFAULT_ATTACK_STYLES.ranged);
    expect(DEFAULT_ATTACK_STYLES.melee.kind).toBe('swipe');
    expect(DEFAULT_ATTACK_STYLES.ranged.kind).toBe('dot');
  });
});
