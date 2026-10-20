export type Role = 'healer' | 'dps';
export type DpsRange = 'melee' | 'ranged';

export type ClassId =
  | 'death-knight'
  | 'demon-hunter'
  | 'druid'
  | 'evoker'
  | 'hunter'
  | 'mage'
  | 'monk'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

export interface ClassInfo {
  id: ClassId;
  name: string;
}

export interface PlayerChoice {
  role: Role;
  /** Only set for dps. */
  range?: DpsRange;
  classId: ClassId;
}
