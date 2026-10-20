import type { ClassId, ClassInfo, DpsRange, Role } from './player';

/** `color` is the standard in-game WoW class colour. */
export const CLASSES: Record<ClassId, ClassInfo> = {
  'death-knight': { id: 'death-knight', name: 'Death Knight', color: 0xc41e3a },
  'demon-hunter': { id: 'demon-hunter', name: 'Demon Hunter', color: 0xa330c9 },
  druid: { id: 'druid', name: 'Druid', color: 0xff7c0a },
  evoker: { id: 'evoker', name: 'Evoker', color: 0x33937f },
  hunter: { id: 'hunter', name: 'Hunter', color: 0xaad372 },
  mage: { id: 'mage', name: 'Mage', color: 0x3fc7eb },
  monk: { id: 'monk', name: 'Monk', color: 0x00ff98 },
  paladin: { id: 'paladin', name: 'Paladin', color: 0xf48cba },
  priest: { id: 'priest', name: 'Priest', color: 0xffffff },
  rogue: { id: 'rogue', name: 'Rogue', color: 0xfff468 },
  shaman: { id: 'shaman', name: 'Shaman', color: 0x0070dd },
  warlock: { id: 'warlock', name: 'Warlock', color: 0x8788ee },
  warrior: { id: 'warrior', name: 'Warrior', color: 0xc69b6d },
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
