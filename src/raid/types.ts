/** The four kinds of raid member. Tanks are never the player, but there are always two NPC tanks. */
export type RaidRole = 'tank' | 'healer' | 'melee' | 'ranged';

export const RAID_ROLES: readonly RaidRole[] = ['tank', 'melee', 'healer', 'ranged'];

/** How a role is named in the fight log, e.g. "Ranged DPS has died!". */
export const ROLE_LABEL: Record<RaidRole, string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
};
