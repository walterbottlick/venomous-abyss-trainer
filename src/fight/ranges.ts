import { PIXELS_PER_METER } from '../game/config';
import type { Vec2 } from '../game/movement';
import type { ClassId, DpsRange } from '../game/player';

/**
 * How close a DPS must be to the boss to auto-attack, in in-game meters (1 meter is
 * PIXELS_PER_METER pixels, set in game/config.ts).
 *
 * Range is measured between the edges of the two icons, not their centres, so a DPS touching the
 * boss is at 0m. A class lists a number for each kind of DPS it can be: `melee` for its melee
 * specs and `ranged` for its ranged ones. Druid, Hunter and Shaman have both.
 */
export const DPS_RANGE_METERS: Record<ClassId, Partial<Record<DpsRange, number>>> = {
  'death-knight': { melee: 2 },
  'demon-hunter': { melee: 2 },
  druid: { melee: 2, ranged: 20 },
  evoker: { ranged: 10 },
  hunter: { melee: 2, ranged: 20 },
  mage: { ranged: 20 },
  monk: { melee: 2 },
  paladin: { melee: 2 },
  priest: { ranged: 20 },
  rogue: { melee: 2 },
  shaman: { melee: 2, ranged: 20 },
  warlock: { ranged: 20 },
  warrior: { melee: 2 },
};

/** Used if a class has no entry above for the chosen kind of DPS. */
export const FALLBACK_RANGE_METERS = 20;

/**
 * The range of the NPC DPS. NPCs have no class, so they use one number per kind. NPC ranged DPS
 * stand well back from the boss (see raid/config.ts), so theirs needs to be long enough to reach it.
 */
export const NPC_RANGE_METERS: Record<DpsRange, number> = {
  melee: 2,
  ranged: 20,
};

/** The range for a player who picked this class and kind of DPS. */
export function rangeMetersFor(classId: ClassId, range: DpsRange): number {
  return DPS_RANGE_METERS[classId][range] ?? FALLBACK_RANGE_METERS;
}

/** The gap between the edges of two round icons, in pixels. Zero if they touch or overlap. */
export function edgeDistance(a: Vec2, aRadius: number, b: Vec2, bRadius: number): number {
  return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - aRadius - bRadius);
}

/** Whether an attacker is close enough to the boss to hit it, given its range in meters. */
export function isInRange(
  attacker: Vec2,
  attackerRadius: number,
  boss: Vec2,
  bossRadius: number,
  rangeMeters: number,
): boolean {
  return edgeDistance(attacker, attackerRadius, boss, bossRadius) <= rangeMeters * PIXELS_PER_METER;
}
