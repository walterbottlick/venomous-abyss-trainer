import type { PlayerChoice } from '../game/player';
import { RAID_SLOTS } from './config';
import { RAID_ROLES, type RaidRole } from './types';

/** The raid role the player fills. */
export function playerRaidRole(choice: PlayerChoice): RaidRole {
  if (choice.role === 'healer') return 'healer';
  return choice.range === 'melee' ? 'melee' : 'ranged';
}

/** How many NPCs of each role the raid needs: the full raid minus the player's own slot. */
export function npcCounts(choice: PlayerChoice): Record<RaidRole, number> {
  const counts = { ...RAID_SLOTS };
  counts[playerRaidRole(choice)] -= 1;
  return counts;
}

/** The NPC roles as a flat list, in a stable order (tanks, melee, healers, ranged). */
export function npcRoles(choice: PlayerChoice): RaidRole[] {
  const counts = npcCounts(choice);
  return RAID_ROLES.flatMap((role) => Array<RaidRole>(counts[role]).fill(role));
}
