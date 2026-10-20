import Phaser from 'phaser';
import { classIconKey } from '../assets/manifest';
import { classesFor } from '../game/classes';
import { COLORS, GAME_WIDTH } from '../game/config';
import type { DpsRange, Role } from '../game/player';
import { createButton, createTitle } from '../ui/button';
import { addText, navigate, setupLogicalCamera } from '../ui/render';

/** On-screen size of a class icon. The source art is 100x100. */
const ICON_SIZE = 64;

interface ClassSelectData {
  role: Role;
  range?: DpsRange;
}

export class ClassSelectScene extends Phaser.Scene {
  private role: Role = 'healer';
  private range: DpsRange | undefined;

  constructor() {
    super('ClassSelectScene');
  }

  init(data: ClassSelectData): void {
    this.role = data.role;
    this.range = data.range;
  }

  create(): void {
    setupLogicalCamera(this);
    createTitle(this, 'Choose your class', 60);

    const classes = classesFor(this.role, this.range);
    const columns = 5;
    const cell = 140;
    const startX = GAME_WIDTH / 2 - ((Math.min(columns, classes.length) - 1) * cell) / 2;

    classes.forEach((info, i) => {
      const x = startX + (i % columns) * cell;
      const y = 170 + Math.floor(i / columns) * 130;
      const frame = this.add.rectangle(x, y, ICON_SIZE + 8, ICON_SIZE + 8, 0x000000);
      frame.setStrokeStyle(3, COLORS.arenaBorder);
      const icon = this.add.image(x, y, classIconKey(info.id)).setDisplaySize(ICON_SIZE, ICON_SIZE);
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerover', () => frame.setStrokeStyle(3, 0xffffff));
      icon.on('pointerout', () => frame.setStrokeStyle(3, COLORS.arenaBorder));
      icon.on('pointerup', () =>
        navigate(this, 'BossSelectScene', {
          choice: { role: this.role, range: this.range, classId: info.id },
        }),
      );
      addText(this, x, y + ICON_SIZE / 2 + 18, info.name, {
        fontSize: '14px',
        color: COLORS.text,
      }).setOrigin(0.5);
    });

    createButton(
      this,
      GAME_WIDTH / 2,
      480,
      'Back',
      () => navigate(this, this.role === 'dps' ? 'RangeSelectScene' : 'RoleSelectScene'),
      { width: 160 },
    );
  }
}
