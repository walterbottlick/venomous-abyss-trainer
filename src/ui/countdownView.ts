import Phaser from 'phaser';
import { COUNTDOWN_COLOR_CSS, COUNTDOWN_FONT_SIZE } from '../fight/config';
import type { Vec2 } from '../game/movement';
import { addText } from './render';

/** The big "3, 2, 1" shown in the middle of the arena before a fight. */
export class CountdownView {
  private readonly text: Phaser.GameObjects.Text;
  private shown: number | null = null;

  constructor(scene: Phaser.Scene, center: Vec2) {
    this.text = addText(scene, center.x, center.y, '', {
      fontSize: `${COUNTDOWN_FONT_SIZE}px`,
      color: COUNTDOWN_COLOR_CSS,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 8,
    })
      .setOrigin(0.5)
      .setDepth(900)
      .setVisible(false);
  }

  /**
   * Shows `number` (or hides the countdown when it is null). `progress` is how far through that
   * number's moment we are, 0 to 1: each number pops in large and shrinks as it fades.
   */
  show(number: number | null, progress: number): void {
    if (number === null) {
      this.text.setVisible(false);
      this.shown = null;
      return;
    }
    if (number !== this.shown) {
      this.text.setText(String(number));
      this.shown = number;
    }
    this.text.setVisible(true);
    this.text.setScale(1.5 - 0.5 * progress);
    this.text.setAlpha(1 - 0.6 * progress);
  }

  destroy(): void {
    this.text.destroy();
  }
}
