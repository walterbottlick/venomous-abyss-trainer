import Phaser from 'phaser';
import { loadSharedAssets } from '../assets/manifest';
import { showLoadingBar } from '../ui/loading';

/** Loads the art the menus share, with a progress bar, then opens the main menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    showLoadingBar(this);
    loadSharedAssets(this.load);
  }

  create(): void {
    this.scene.start('RoleSelectScene');
  }
}
