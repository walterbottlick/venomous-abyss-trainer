import Phaser from 'phaser';
import { PROMPT_COLOR_CSS, PROMPT_FONT_SIZE, PROMPT_TOP } from '../fight/config';
import { addText } from './render';

/** An instruction shown at the top of the arena, like "Right click to death grip the Burning Venom!". */
export class PromptBanner {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, arenaWidth: number) {
    this.text = addText(scene, arenaWidth / 2, PROMPT_TOP, '', {
      fontSize: `${PROMPT_FONT_SIZE}px`,
      color: PROMPT_COLOR_CSS,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
      wordWrap: { width: arenaWidth - 40 },
    })
      .setOrigin(0.5, 0)
      .setDepth(900)
      .setVisible(false);
  }

  /** Shows `message`, or hides the banner when it is null. */
  set(message: string | null): void {
    if (message === null) {
      this.text.setVisible(false);
      return;
    }
    if (this.text.text !== message) this.text.setText(message);
    this.text.setVisible(true);
  }
}
