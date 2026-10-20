import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { LOG_FONT_SIZE, LOG_MAX_MESSAGES } from '../fight/config';
import { addText } from './render';

export interface LogArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A small panel listing what has happened in the fight, newest at the bottom. */
export class CombatLog {
  private readonly messages: string[] = [];
  private readonly body: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, area: LogArea) {
    const { x, y, width, height } = area;
    scene.add
      .rectangle(x, y, width, height, 0x000000, 0.35)
      .setOrigin(0)
      .setStrokeStyle(1, COLORS.arenaBorder);
    addText(scene, x + 8, y + 6, 'Fight Log', { fontSize: '12px', color: COLORS.muted });
    this.body = addText(scene, x + 8, y + 26, '', {
      fontSize: `${LOG_FONT_SIZE}px`,
      color: COLORS.text,
      wordWrap: { width: width - 16 },
      lineSpacing: 3,
    });
  }

  add(message: string): void {
    this.messages.push(message);
    if (this.messages.length > LOG_MAX_MESSAGES) this.messages.shift();
    this.body.setText(this.messages.join('\n'));
  }
}
