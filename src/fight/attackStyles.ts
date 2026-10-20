import type { ClassId } from '../game/player';
import type { RaidRole } from '../raid/types';
import { MELEE_SWIPE_COLOR, RANGED_DOT_COLOR } from './config';

/**
 * What a DPS's attack looks like. Each kind is drawn by `AttackEffects` (ui/attackEffects.ts):
 *
 *  - `swipe`  an arc swung toward the boss (melee)
 *  - `stab`   two quick thrusts toward the boss (melee)
 *  - `dot`    a small ball that flies to the boss (ranged)
 *  - `star`   a small spinning star that flies to the boss (ranged)
 *  - `arrow`  a ">" that flies to the boss, pointing the way it travels (ranged)
 *  - `beam`   a line from the attacker to the boss that fades in and out (ranged)
 *
 * `color` is a 0xRRGGBB number. Projectiles (dot, star, arrow) home in on the boss and cannot miss.
 */
export type AttackStyle = {
  kind: 'swipe' | 'stab' | 'dot' | 'star' | 'arrow' | 'beam';
  color: number;
};

type DpsKind = 'melee' | 'ranged';

const GREEN = 0x59e03a;
const RED = 0xe03a3a;

/**
 * Each class's attack animation, by kind of DPS. A class only needs an entry for the kinds it can
 * be (Druid, Hunter and Shaman have both). Change a colour or swap a `kind` to restyle a class.
 */
export const CLASS_ATTACK_STYLES: Record<ClassId, Partial<Record<DpsKind, AttackStyle>>> = {
  'death-knight': { melee: { kind: 'swipe', color: GREEN } },
  'demon-hunter': { melee: { kind: 'swipe', color: 0xa330c9 } }, // purple
  paladin: { melee: { kind: 'swipe', color: 0xffe14d } }, // yellow
  warrior: { melee: { kind: 'swipe', color: RED } },
  monk: { melee: { kind: 'swipe', color: 0x00ff98 } }, // jade green
  rogue: { melee: { kind: 'stab', color: 0x7dff5a } }, // green
  druid: {
    melee: { kind: 'stab', color: RED },
    ranged: { kind: 'star', color: 0x8fd8ff }, // light blue
  },
  hunter: {
    melee: { kind: 'stab', color: 0xff9a2e }, // brown
    ranged: { kind: 'arrow', color: 0xffffff },
  },
  shaman: {
    melee: { kind: 'swipe', color: 0x0070dd }, // blue
    ranged: { kind: 'arrow', color: RED },
  },
  evoker: { ranged: { kind: 'star', color: 0xff9a2e } }, // orange
  mage: { ranged: { kind: 'star', color: RED } },
  warlock: { ranged: { kind: 'arrow', color: 0x9b4dff } }, // purple
  priest: { ranged: { kind: 'beam', color: 0x230778 } }, // purple
};

/** Used by NPCs (they have no class) and by any class without an entry above. */
export const DEFAULT_ATTACK_STYLES: Record<DpsKind, AttackStyle> = {
  melee: { kind: 'swipe', color: MELEE_SWIPE_COLOR },
  ranged: { kind: 'dot', color: RANGED_DOT_COLOR },
};

/** The animation for an attacker with this role (and class, for the player). */
export function attackStyleFor(role: RaidRole, classId?: ClassId): AttackStyle {
  const kind: DpsKind = role === 'melee' ? 'melee' : 'ranged';
  return (classId && CLASS_ATTACK_STYLES[classId][kind]) || DEFAULT_ATTACK_STYLES[kind];
}
