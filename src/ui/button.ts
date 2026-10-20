import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../game/config';
import { addText } from './render';

export interface ButtonOptions {
  width?: number;
  height?: number;
  enabled?: boolean;
  fill?: number;
  /** Texture key of an icon shown at the left of the button. */
  icon?: string;
}

const ICON_SIZE = 32;

/** A simple rectangle button drawn in code, with an optional icon. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  { width = 260, height = 44, enabled = true, fill = COLORS.button, icon }: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, width, height, enabled ? fill : 0x1a1f24);
  bg.setStrokeStyle(2, enabled ? COLORS.arenaBorder : 0x2a3138);
  const parts: Phaser.GameObjects.GameObject[] = [bg];

  const iconSpace = icon ? ICON_SIZE + 12 : 0;
  const text = addText(scene, iconSpace / 2, 0, label, {
    fontSize: '20px',
    color: enabled ? COLORS.text : COLORS.muted,
  }).setOrigin(0.5);

  if (icon) {
    const image = scene.add
      .image(-width / 2 + 10 + ICON_SIZE / 2, 0, icon)
      .setDisplaySize(ICON_SIZE, ICON_SIZE);
    if (!enabled) image.setAlpha(0.4);
    parts.push(image);
  }
  parts.push(text);
  const container = scene.add.container(x, y, parts);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(COLORS.buttonHover));
    bg.on('pointerout', () => bg.setFillStyle(fill));
    bg.on('pointerup', onClick);
  }
  return container;
}

export function createTitle(scene: Phaser.Scene, text: string, y = 60): void {
  addText(scene, GAME_WIDTH / 2, y, text, { fontSize: '32px', color: COLORS.text }).setOrigin(0.5);
}
