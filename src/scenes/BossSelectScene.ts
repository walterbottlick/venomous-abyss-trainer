import Phaser from 'phaser';
import { BOSSES } from '../bosses/registry';
import type { BossSceneData } from '../bosses/types';
import { GAME_WIDTH } from '../game/config';
import { createButton, createTitle } from '../ui/button';

export class BossSelectScene extends Phaser.Scene {
  private sceneData!: BossSceneData;

  constructor() {
    super('BossSelectScene');
  }

  init(data: BossSceneData): void {
    this.sceneData = data;
  }

  create(): void {
    createTitle(this, 'Choose a boss', 40);

    BOSSES.forEach((boss, i) => {
      const column = i < 5 ? 0 : 1;
      const row = i < 5 ? i : i - 5;
      const x = GAME_WIDTH / 2 + (column === 0 ? -170 : 170);
      const y = 120 + row * 60;
      const { sceneKey } = boss;
      createButton(
        this,
        x,
        y,
        sceneKey ? boss.name : `${boss.name} (soon)`,
        () => {
          if (sceneKey) this.scene.start(sceneKey, this.sceneData);
        },
        { width: 320, enabled: sceneKey !== undefined },
      );
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      480,
      'Change class',
      () => this.scene.start('RoleSelectScene'),
      { width: 200 },
    );
  }
}
