import type { ClassId, ClassInfo, DpsRange, Role } from './player';

export const CLASSES: Record<ClassId, ClassInfo> = {
  'death-knight': { id: 'death-knight', name: 'Death Knight' },
  'demon-hunter': { id: 'demon-hunter', name: 'Demon Hunter' },
  druid: { id: 'druid', name: 'Druid' },
  evoker: { id: 'evoker', name: 'Evoker' },
  hunter: { id: 'hunter', name: 'Hunter' },
  mage: { id: 'mage', name: 'Mage' },
  monk: { id: 'monk', name: 'Monk' },
  paladin: { id: 'paladin', name: 'Paladin' },
  priest: { id: 'priest', name: 'Priest' },
  rogue: { id: 'rogue', name: 'Rogue' },
  shaman: { id: 'shaman', name: 'Shaman' },
  warlock: { id: 'warlock', name: 'Warlock' },
  warrior: { id: 'warrior', name: 'Warrior' },
};

const HEALERS: ClassId[] = ['druid', 'evoker', 'monk', 'paladin', 'priest', 'shaman'];
const MELEE: ClassId[] = [
  'death-knight',
  'demon-hunter',
  'druid',
  'hunter',
  'monk',
  'paladin',
  'rogue',
  'shaman',
  'warrior',
];
const RANGED: ClassId[] = ['druid', 'evoker', 'hunter', 'mage', 'priest', 'shaman', 'warlock'];

/** Classes that have at least one spec in the chosen role (and range, for dps). */
export function classesFor(role: Role, range?: DpsRange): ClassInfo[] {
  const ids = role === 'healer' ? HEALERS : range === 'melee' ? MELEE : RANGED;
  return ids.map((id) => CLASSES[id]);
}
