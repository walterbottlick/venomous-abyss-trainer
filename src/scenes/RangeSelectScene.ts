import Phaser from 'phaser';
import { GAME_WIDTH } from '../game/config';
import { createButton, createTitle } from '../ui/button';
import { navigate, setupLogicalCamera } from '../ui/render';

export class RangeSelectScene extends Phaser.Scene {
  constructor() {
    super('RangeSelectScene');
  }

  create(): void {
    setupLogicalCamera(this);
    createTitle(this, 'Melee or ranged?', 90);

    createButton(this, GAME_WIDTH / 2, 220, 'Melee DPS', () =>
      navigate(this, 'ClassSelectScene', { role: 'dps', range: 'melee' }),
    );
    createButton(this, GAME_WIDTH / 2, 280, 'Ranged DPS', () =>
      navigate(this, 'ClassSelectScene', { role: 'dps', range: 'ranged' }),
    );
    createButton(this, GAME_WIDTH / 2, 400, 'Back', () => navigate(this, 'RoleSelectScene'), {
      width: 160,
    });
  }
}
