import type Phaser from 'phaser';
import { bossAssetPath } from '../../assets/manifest';

const ID = 'vashnik-the-malignant';

/** Texture keys for this fight. */
export const VASHNIK_ASSETS = {
  background: 'vashnik-background',
  boss: 'vashnik-boss',
  burningVenom: 'vashnik-burning-venom',
  clottingVenom: 'vashnik-clotting-venom',
  shroudedVenom: 'vashnik-shrouded-venom',
  totem: 'vashnik-totem',
} as const;

export function loadVashnikAssets(load: Phaser.Loader.LoaderPlugin): void {
  const a = VASHNIK_ASSETS;
  load.image(a.background, bossAssetPath(ID, 'background.png'));
  load.image(a.boss, bossAssetPath(ID, 'boss/vashnik-the-malignant.png'));
  load.image(a.burningVenom, bossAssetPath(ID, 'minions/burning-venom.png'));
  load.image(a.clottingVenom, bossAssetPath(ID, 'minions/clotting-venom.png'));
  load.image(a.shroudedVenom, bossAssetPath(ID, 'minions/shrouded-venom.png'));
  load.image(a.totem, bossAssetPath(ID, 'objects/totem.png'));
}
