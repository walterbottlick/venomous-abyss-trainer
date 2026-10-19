import Phaser from 'phaser';
import { GAME_WIDTH } from '../game/config';
import { createButton, createTitle } from '../ui/button';

export class RoleSelectScene extends Phaser.Scene {
  constructor() {
    super('RoleSelectScene');
  }

  create(): void {
    createTitle(this, 'Venomous Abyss Trainer', 90);
    this.add
      .text(GAME_WIDTH / 2, 150, 'Choose your role', { fontSize: '22px', color: '#8aa08a' })
      .setOrigin(0.5);

    createButton(this, GAME_WIDTH / 2, 240, 'Healer', () =>
      this.scene.start('ClassSelectScene', { role: 'healer' }),
    );
    createButton(this, GAME_WIDTH / 2, 300, 'DPS', () => this.scene.start('RangeSelectScene'));
  }
}
