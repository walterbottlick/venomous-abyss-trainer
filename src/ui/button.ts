import Phaser from 'phaser';
import { COLORS } from '../game/config';

export interface ButtonOptions {
  width?: number;
  height?: number;
  enabled?: boolean;
  fill?: number;
}

/** A simple rectangle button drawn in code, so menus need no art. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  { width = 260, height = 44, enabled = true, fill = COLORS.button }: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, width, height, enabled ? fill : 0x1a1f24);
  bg.setStrokeStyle(2, enabled ? COLORS.arenaBorder : 0x2a3138);
  const text = scene.add
    .text(0, 0, label, { fontSize: '20px', color: enabled ? COLORS.text : COLORS.muted })
    .setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, text]);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(COLORS.buttonHover));
    bg.on('pointerout', () => bg.setFillStyle(fill));
    bg.on('pointerup', onClick);
  }
  return container;
}

export function createTitle(scene: Phaser.Scene, text: string, y = 60): void {
  scene.add
    .text(scene.scale.width / 2, y, text, { fontSize: '32px', color: COLORS.text })
    .setOrigin(0.5);
}
