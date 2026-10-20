import type Phaser from 'phaser';
import { BOSSES } from '../bosses/registry';
import { CLASSES } from '../game/classes';
import type { ClassId, PlayerChoice } from '../game/player';

/**
 * Asset paths and texture keys. Files live in public/assets (see the README there) and are
 * loaded relative to the page so the game also works when hosted in a sub-folder.
 */
const ROOT = 'assets';

export type RoleIconId = 'tank' | 'healer' | 'melee-dps' | 'ranged-dps';

export const MARKER_IDS = [
  'star',
  'circle',
  'diamond',
  'triangle',
  'moon',
  'square',
  'cross',
  'skull',
] as const;
export type MarkerId = (typeof MARKER_IDS)[number];

export const classIconKey = (id: ClassId): string => `class-${id}`;
export const roleIconKey = (id: RoleIconId): string => `role-${id}`;
export const markerKey = (id: MarkerId): string => `marker-${id}`;
export const encounterIconKey = (bossId: string): string => `encounter-${bossId}`;

/** Path to a file inside a boss's folder, e.g. `bossAssetPath('ulatek', 'background.png')`. */
export const bossAssetPath = (bossId: string, file: string): string =>
  `${ROOT}/bosses/${bossId}/${file}`;

/** Which generic role icon represents the player's chosen role. */
export function roleIconFor(choice: PlayerChoice): RoleIconId {
  if (choice.role === 'healer') return 'healer';
  return choice.range === 'melee' ? 'melee-dps' : 'ranged-dps';
}

/** Everything the menus need. Loaded once, up front, by BootScene. Fight art loads per boss. */
export function loadSharedAssets(load: Phaser.Loader.LoaderPlugin): void {
  for (const id of Object.keys(CLASSES) as ClassId[]) {
    load.image(classIconKey(id), `${ROOT}/icons/classes/${id}.jpeg`);
  }
  for (const id of ['tank', 'healer', 'melee-dps', 'ranged-dps'] as const) {
    load.image(roleIconKey(id), `${ROOT}/icons/roles/${id}.png`);
  }
  for (const id of MARKER_IDS) {
    load.image(markerKey(id), `${ROOT}/icons/markers/${id}.png`);
  }
  for (const boss of BOSSES) {
    load.image(encounterIconKey(boss.id), bossAssetPath(boss.id, `boss/${boss.id}-icon.jpg`));
  }
}
