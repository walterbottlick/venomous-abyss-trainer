import { describe, expect, it } from 'vitest';
import { classesFor } from '../game/classes';
import { PIXELS_PER_METER } from '../game/config';
import type { PlayerChoice } from '../game/player';
import { npcRoles, playerRaidRole } from '../raid/composition';
import { abilityLines } from './abilities';
import { DPS_COOLDOWN_SECONDS, DPS_DAMAGE_PER_ATTACK } from './config';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';
import {
  DPS_RANGE_METERS,
  edgeDistance,
  FALLBACK_RANGE_METERS,
  isInRange,
  NPC_RANGE_METERS,
  rangeMetersFor,
} from './ranges';

const healer: PlayerChoice = { role: 'healer', classId: 'priest' };
const melee: PlayerChoice = { role: 'dps', range: 'melee', classId: 'rogue' };
const ranged: PlayerChoice = { role: 'dps', range: 'ranged', classId: 'mage' };

/** A fight with random choices fixed, so every DPS is ready to attack straight away. */
function fightFor(choice: PlayerChoice, playerRangeMeters = 5): Fight {
  return new Fight({
    playerRole: playerRaidRole(choice),
    npcRoles: npcRoles(choice),
    playerRangeMeters,
    random: () => 0,
  });
}

const dpsOf = (fight: Fight) =>
  fight.raiders.filter((c) => c.role === 'melee' || c.role === 'ranged');

/** Advance in small steps, like frames. */
function run(fight: Fight, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds - 1e-9; t += step) fight.update(step);
}

describe('DPS auto-attacks', () => {
  it('deal 1 damage per DPS per second: 6 DPS is 6 damage a second', () => {
    const fight = fightFor(healer); // the player heals; all 6 DPS are NPCs
    const dps = dpsOf(fight);
    expect(dps).toHaveLength(6);
    dps.forEach((c) => fight.setInRange(c.id, true));

    expect(DPS_DAMAGE_PER_ATTACK).toBe(1);
    run(fight, 1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(6);
    run(fight, 1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(12);
  });

  it('count the player when they are a DPS', () => {
    const fight = fightFor(melee); // the player and 5 NPC DPS
    dpsOf(fight).forEach((c) => fight.setInRange(c.id, true));
    run(fight, 1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(6);
  });

  it('wait a second between attacks, even if checked every frame', () => {
    const fight = fightFor(melee);
    fight.setInRange(PLAYER_ID, true);
    fight.update(0.1);
    fight.update(0.1);
    fight.update(DPS_COOLDOWN_SECONDS - 0.3);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(1);
    fight.update(0.25); // comfortably past the cooldown, clear of rounding
    expect(fight.boss.maxHealth - fight.boss.health).toBe(2);
  });

  it('do nothing while out of range, and attack as soon as back in range', () => {
    const fight = fightFor(melee);
    run(fight, 3);
    expect(fight.boss.health).toBe(fight.boss.maxHealth);

    fight.setInRange(PLAYER_ID, true);
    fight.update(0.1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(1);
  });

  it('never come from tanks or healers', () => {
    const fight = fightFor(healer);
    for (const c of fight.raiders) fight.setInRange(c.id, true);
    // Only the 6 DPS count; the 2 tanks and 2 healers (one of them the player) add nothing.
    run(fight, 1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(6);
  });

  it('stop when the DPS dies', () => {
    const fight = fightFor(healer);
    const dps = dpsOf(fight);
    dps.forEach((c) => fight.setInRange(c.id, true));
    fight.kill(dps[0]!.id);
    run(fight, 1);
    expect(fight.boss.maxHealth - fight.boss.health).toBe(5);
  });

  it('report each attack as an event, for the animation', () => {
    const fight = fightFor(melee);
    fight.setInRange(PLAYER_ID, true);
    fight.update(0.1);
    expect(fight.drainEvents()).toContainEqual({ type: 'attacked', id: PLAYER_ID });
  });

  it('win the fight when the boss reaches 0 health', () => {
    const fight = fightFor(melee);
    dpsOf(fight).forEach((c) => fight.setInRange(c.id, true));
    fight.setHealth(BOSS_ID, 6);
    run(fight, 1);
    expect(fight.boss.alive).toBe(false);
    expect(fight.status).toBe('won');
  });
});

describe('attack ranges', () => {
  it('give every class a positive range', () => {
    for (const [, ranges] of Object.entries(DPS_RANGE_METERS)) {
      for (const meters of Object.values(ranges)) expect(meters).toBeGreaterThan(0);
    }
  });

  it('cover every class and kind of DPS the menus offer', () => {
    for (const kind of ['melee', 'ranged'] as const) {
      for (const info of classesFor('dps', kind)) {
        expect(DPS_RANGE_METERS[info.id][kind]).toBeTypeOf('number');
      }
    }
  });

  it('fall back to a default for a missing entry', () => {
    expect(rangeMetersFor('mage', 'melee')).toBe(FALLBACK_RANGE_METERS);
  });

  it('give the player their class range, and NPCs the NPC ranges', () => {
    const fight = fightFor(ranged, rangeMetersFor('mage', 'ranged'));
    expect(fight.player.rangeMeters).toBe(rangeMetersFor('mage', 'ranged'));
    const npcMelee = fight.npcs.find((c) => c.role === 'melee')!;
    const npcRanged = fight.npcs.find((c) => c.role === 'ranged')!;
    expect(npcMelee.rangeMeters).toBe(NPC_RANGE_METERS.melee);
    expect(npcRanged.rangeMeters).toBe(NPC_RANGE_METERS.ranged);
    expect(fight.npcs.find((c) => c.role === 'tank')!.rangeMeters).toBe(0);
  });
});

describe('range geometry', () => {
  const boss = { x: 100, y: 100 };

  it('measures between icon edges, not centres', () => {
    expect(edgeDistance({ x: 140, y: 100 }, 6, boss, 24)).toBe(10);
    expect(edgeDistance({ x: 110, y: 100 }, 6, boss, 24)).toBe(0); // overlapping
  });

  it('turns meters into pixels using PIXELS_PER_METER', () => {
    // An attacker with a 5m range reaches 5 * PIXELS_PER_METER pixels past the boss's edge.
    const reach = 5 * PIXELS_PER_METER;
    const edge = 24 + 6; // boss radius + attacker radius
    expect(isInRange({ x: 100 + edge + reach, y: 100 }, 6, boss, 24, 5)).toBe(true);
    expect(isInRange({ x: 100 + edge + reach + 1, y: 100 }, 6, boss, 24, 5)).toBe(false);
  });
});

describe('ability text', () => {
  it('tells a healer their clicks', () => {
    expect(abilityLines(healer)).toEqual(['Left click: Heal', 'Right click: Dispel']);
  });

  it("tells a DPS to stay in range, with their class's range", () => {
    const meters = rangeMetersFor('rogue', 'melee');
    expect(abilityLines(melee)).toEqual([`Stay in range to auto-attack. Range: ${meters}m`]);
  });
});
