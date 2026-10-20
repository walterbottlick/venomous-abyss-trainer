import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../game/config';

/**
 * Lets scenes keep working in logical 960x540 coordinates while the canvas renders at
 * RENDER_SCALE times that size. Call at the top of every scene's create().
 */
export function setupLogicalCamera(scene: Phaser.Scene): void {
  const camera = scene.cameras.main;
  camera.setZoom(RENDER_SCALE);
  camera.setScroll(
    GAME_WIDTH / 2 - (GAME_WIDTH * RENDER_SCALE) / 2,
    GAME_HEIGHT / 2 - (GAME_HEIGHT * RENDER_SCALE) / 2,
  );
}

/** Text rasterised at render resolution so it stays sharp under camera zoom. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...style, resolution: RENDER_SCALE });
}

/**
 * Switch scenes, ignoring any further clicks from the scene being left. Without this, two
 * quick clicks can start two different scenes at once, leaving both on screen.
 */
export function navigate(scene: Phaser.Scene, key: string, data?: object): void {
  if (!scene.input.enabled) return;
  scene.input.enabled = false;
  scene.scene.start(key, data);
}
