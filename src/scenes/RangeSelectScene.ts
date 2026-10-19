import Phaser from 'phaser';
import { GAME_WIDTH } from '../game/config';
import { createButton, createTitle } from '../ui/button';

export class RangeSelectScene extends Phaser.Scene {
  constructor() {
    super('RangeSelectScene');
  }

  create(): void {
    createTitle(this, 'Melee or ranged?', 90);

    createButton(this, GAME_WIDTH / 2, 220, 'Melee DPS', () =>
      this.scene.start('ClassSelectScene', { role: 'dps', range: 'melee' }),
    );
    createButton(this, GAME_WIDTH / 2, 280, 'Ranged DPS', () =>
      this.scene.start('ClassSelectScene', { role: 'dps', range: 'ranged' }),
    );
    createButton(this, GAME_WIDTH / 2, 400, 'Back', () => this.scene.start('RoleSelectScene'), {
      width: 160,
    });
  }
}
