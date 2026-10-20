import { describe, expect, it } from 'vitest';
import type { PlayerChoice } from '../game/player';
import { moveToward, type Vec2 } from '../game/movement';
import { npcCounts, npcRoles } from './composition';
import { IDLE_PAUSE_SECONDS, IDLE_RADIUS, IDLE_SPEED, MIN_NPC_GAP, ROLE_LAYOUT } from './config';
import { createIdle, stepIdle } from './idle';
import { computeSlots, type LayoutInput } from './layout';
import type { RaidRole } from './types';

const healer: PlayerChoice = { role: 'healer', classId: 'priest' };
const melee: PlayerChoice = { role: 'dps', range: 'melee', classId: 'rogue' };
const ranged: PlayerChoice = { role: 'dps', range: 'ranged', classId: 'mage' };

/** Small, repeatable random numbers for tests. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('npcCounts', () => {
  it('leaves one fewer healer when the player is a healer', () => {
    expect(npcCounts(healer)).toEqual({ tank: 2, healer: 1, melee: 3, ranged: 3 });
  });

  it('leaves one fewer melee when the player is melee dps', () => {
    expect(npcCounts(melee)).toEqual({ tank: 2, healer: 2, melee: 2, ranged: 3 });
  });

  it('leaves one fewer ranged when the player is ranged dps', () => {
    expect(npcCounts(ranged)).toEqual({ tank: 2, healer: 2, melee: 3, ranged: 2 });
  });

  it('always fills a raid of 10 with the player', () => {
    for (const choice of [healer, melee, ranged]) {
      expect(npcRoles(choice)).toHaveLength(9);
    }
  });
});

const baseInput = (roles: RaidRole[]): LayoutInput => ({
  roles,
  boss: { x: 345, y: 110 },
  bossRadius: 24,
  npcRadius: 32 / 3,
  arena: { width: 690, height: 540 },
});

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('computeSlots', () => {
  for (const [name, choice] of [
    ['healer', healer],
    ['melee', melee],
    ['ranged', ranged],
  ] as const) {
    describe(`for a ${name} player`, () => {
      const input = baseInput(npcRoles(choice));
      const slots = computeSlots(input);

      it('places one slot per NPC', () => {
        expect(slots).toHaveLength(9);
      });

      it('never stacks or crowds NPCs', () => {
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            const a = slots[i]!;
            const b = slots[j]!;
            const needed =
              input.npcRadius * 2 + IDLE_RADIUS[a.role] + IDLE_RADIUS[b.role] + MIN_NPC_GAP;
            expect(distance(a.home, b.home)).toBeGreaterThanOrEqual(needed - 0.05);
          }
        }
      });

      it('keeps everyone off the boss and inside the arena', () => {
        for (const slot of slots) {
          expect(distance(slot.home, input.boss)).toBeGreaterThanOrEqual(
            input.bossRadius + input.npcRadius + IDLE_RADIUS[slot.role] - 0.05,
          );
          expect(slot.home.x).toBeGreaterThan(0);
          expect(slot.home.x).toBeLessThan(input.arena.width);
          expect(slot.home.y).toBeGreaterThan(0);
          expect(slot.home.y).toBeLessThan(input.arena.height);
        }
      });

      const average = (role: RaidRole): number => {
        const mine = slots.filter((s) => s.role === role);
        return mine.reduce((sum, s) => sum + distance(s.home, input.boss), 0) / mine.length;
      };

      it('puts tanks and melee at the same distance from the boss, healers and ranged further', () => {
        expect(Math.abs(average('tank') - average('melee'))).toBeLessThan(1);
        expect(average('melee')).toBeLessThan(average('healer'));
        expect(average('melee')).toBeLessThan(average('ranged'));
      });

      it('puts melee on the opposite side of the boss from the tanks', () => {
        // Average direction of each group, as seen from the boss.
        const direction = (role: RaidRole): Vec2 => {
          const mine = slots.filter((s) => s.role === role);
          return {
            x: mine.reduce((sum, s) => sum + (s.home.x - input.boss.x), 0) / mine.length,
            y: mine.reduce((sum, s) => sum + (s.home.y - input.boss.y), 0) / mine.length,
          };
        };
        const tanks = direction('tank');
        const melee = direction('melee');
        expect(tanks.x * melee.x + tanks.y * melee.y).toBeLessThan(0);
        // Tanks are in front (down the arena) and melee behind the boss (up).
        expect(tanks.y).toBeGreaterThan(0);
        expect(melee.y).toBeLessThan(0);
      });

      it('keeps healers and ranged bunched together as one group', () => {
        const group = slots.filter((s) => s.role === 'healer' || s.role === 'ranged');
        const { spacing } = ROLE_LAYOUT.ranged;
        expect(ROLE_LAYOUT.healer.cluster).toBe(ROLE_LAYOUT.ranged.cluster);
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            // Neighbours stand about `spacing` apart, so no pair is further than the whole row.
            expect(distance(group[i]!.home, group[j]!.home)).toBeLessThanOrEqual(
              (group.length - 1) * spacing! + 5,
            );
          }
        }
      });

      it('mixes healers in among the ranged instead of leaving them at one end', () => {
        const group = slots.filter((s) => s.role === 'healer' || s.role === 'ranged');
        const byX = [...group].sort((a, b) => a.home.x - b.home.x).map((s) => s.role);
        const first = byX[0];
        const last = byX[byX.length - 1];
        // Alternating, so healers are never both packed at the left or right end.
        expect(byX.join(',')).not.toMatch(/^healer,healer|healer,healer$/);
        expect(first === 'ranged' || last === 'ranged').toBe(true);
      });

      it('keeps tanks in contact with the boss', () => {
        for (const tank of slots.filter((s) => s.role === 'tank')) {
          const edgeGap = distance(tank.home, input.boss) - input.bossRadius - input.npcRadius;
          expect(edgeGap).toBeLessThanOrEqual(ROLE_LAYOUT.tank.gap + 2);
        }
      });
    });
  }

  it('separates NPCs that would otherwise start on top of each other', () => {
    // Ten tanks all want the same arc around the boss; they must still not overlap.
    const input = baseInput(Array<RaidRole>(10).fill('tank'));
    const slots = computeSlots(input);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(distance(slots[i]!.home, slots[j]!.home)).toBeGreaterThan(input.npcRadius * 2);
      }
    }
  });
});

describe('stepIdle', () => {
  it('stays within the wander radius and actually moves', () => {
    const random = seeded(42);
    const radius = IDLE_RADIUS.healer;
    let state = createIdle(random, IDLE_PAUSE_SECONDS);
    let farthest = 0;
    for (let i = 0; i < 6000; i++) {
      state = stepIdle(state, 1 / 60, {
        radius,
        speed: IDLE_SPEED,
        pause: IDLE_PAUSE_SECONDS,
        random,
      });
      farthest = Math.max(farthest, Math.hypot(state.offset.x, state.offset.y));
      expect(Math.hypot(state.offset.x, state.offset.y)).toBeLessThanOrEqual(radius + 1e-9);
    }
    expect(farthest).toBeGreaterThan(radius * 0.3);
  });

  it('does not change the state it is given', () => {
    const random = seeded(1);
    const state = createIdle(random, IDLE_PAUSE_SECONDS);
    const copy = structuredClone(state);
    stepIdle(state, 1, { radius: 5, speed: 5, pause: [0, 0], random });
    expect(state).toEqual(copy);
  });
});

describe('moveToward', () => {
  it('moves at most the given distance', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
  });

  it('stops on the target instead of overshooting', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 100)).toEqual({ x: 3, y: 4 });
  });
});
