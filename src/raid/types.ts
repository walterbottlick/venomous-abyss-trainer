/** The four kinds of raid member. Tanks are never the player, but there are always two NPC tanks. */
export type RaidRole = 'tank' | 'healer' | 'melee' | 'ranged';

export const RAID_ROLES: readonly RaidRole[] = ['tank', 'melee', 'healer', 'ranged'];
