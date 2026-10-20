import type { RaidRole } from './types';

/**
 * Everything you are likely to tune about the NPC raid lives in this file. Distances and sizes
 * are in the game's logical pixels (the arena is 690x540).
 */

/** The full raid of 10. The player takes one slot of their own role, so NPCs fill the rest. */
export const RAID_SLOTS: Record<RaidRole, number> = {
  tank: 2,
  healer: 2,
  melee: 3,
  ranged: 3,
};

/** NPC icon size as a fraction of the player icon (`PLAYER_SIZE` in game/config.ts). */
export const NPC_SIZE_RATIO = 3 / 4;

/**
 * Where each role stands around the boss, before the NPCs are nudged apart.
 *
 *  - `gap`: clear space between the edge of the boss icon and the edge of the NPC icon.
 *  - `centerAngle`: direction of the group from the boss, in degrees. 0 is straight down the
 *    arena, positive swings toward the right (east), negative toward the left.
 *  - `arc`: how wide, in degrees, the group fans out. A single NPC sits at `centerAngle`.
 *  - `spacing`: optional. Instead of fanning over `arc`, pack the group so neighbours stand this
 *    many pixels apart (centre to centre). Overrides `arc`; use it to keep a group tight.
 *  - `cluster`: optional. Roles with the same cluster name stand together as one group, laid out
 *    with the settings of whichever of them comes first in this list (so give them the same
 *    settings, as BACK_LINE below does).
 *  - `oppositeTo`: optional. Stand on the far side of the boss from that role instead of using
 *    `centerAngle` (the angle is that role's `centerAngle` plus 180 degrees).
 *
 * Tanks and melee both sit in contact with the boss, tanks on one side and melee on the
 * opposite side. Healers and ranged stand far back. Nothing ever overlaps: positions are pushed
 * apart afterwards (see MIN_NPC_GAP).
 */
export interface RoleLayout {
  gap: number;
  centerAngle: number;
  arc?: number;
  spacing?: number;
  oppositeTo?: RaidRole;
  cluster?: string;
}

/** Clear space between the boss and an NPC in contact with it. Shared by tanks and melee. */
const CONTACT_GAP = 3;

/** The shared layout for the group of healers and ranged. */
const BACK_LINE: RoleLayout = { gap: 190, centerAngle: 0, spacing: 52, cluster: 'back-line' };

export const ROLE_LAYOUT: Record<RaidRole, RoleLayout> = {
  tank: { gap: CONTACT_GAP, centerAngle: 0, arc: 70 },
  // Same distance from the boss as the tanks, on the opposite side. `arc` is wide enough that
  // three melee fit side by side around the boss without crowding.
  melee: { gap: CONTACT_GAP, centerAngle: 180, arc: 130, oppositeTo: 'tank' },
  // Healers and ranged stand together as one bunched group, mixed along a single row. Lower
  // `spacing` for a tighter clump; it can't go below the minimum set by NPC size, idle wander
  // and MIN_NPC_GAP.
  healer: BACK_LINE,
  ranged: BACK_LINE,
};

/** Minimum clear space between any two NPC icons, on top of their idle wandering room. */
export const MIN_NPC_GAP = 6;

/** Keep NPC icons at least this far inside the edges of the arena. */
export const ARENA_EDGE_MARGIN = 4;

/**
 * Idle wandering. Each NPC drifts to a random spot within `IDLE_RADIUS` of where it is
 * standing, rests, then picks another. Smaller radius means less movement. Tanks and melee are
 * kept tight so they stay in contact with the boss: their layout gap (CONTACT_GAP) is as small
 * as their wander radius, so raising a radius also pushes that role out from the boss.
 */
export const IDLE_RADIUS: Record<RaidRole, number> = {
  tank: 3,
  melee: 3,
  healer: 8,
  ranged: 8,
};

/** How fast an idling NPC drifts, in pixels per second. */
export const IDLE_SPEED = 8;

/** How long an idling NPC rests between drifts, in seconds: [shortest, longest]. */
export const IDLE_PAUSE_SECONDS: readonly [number, number] = [0, 0.8];

/**
 * How closely each role follows the boss when it moves, from 0 (stays put) to 1 (moves the
 * same distance as the boss, keeping its spot relative to it). Tanks and melee stick to the boss;
 * healers and ranged only drift along a little, so they stay at range. Keep healer and ranged
 * equal, otherwise their group stretches apart as the boss moves.
 */
export const FOLLOW_FACTOR: Record<RaidRole, number> = {
  tank: 1,
  melee: 1,
  healer: 0.25,
  ranged: 0.25,
};

/** Top speed, in pixels per second, an NPC walks at to keep up with the boss. */
export const NPC_MOVE_SPEED = 140;
