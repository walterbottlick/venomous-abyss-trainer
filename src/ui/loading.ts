import type Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../game/config';
import { addText, setupLogicalCamera } from './render';

/** Draws a "Loading..." label and progress bar. Call at the top of a scene's preload(). */
export function showLoadingBar(scene: Phaser.Scene): void {
  setupLogicalCamera(scene);

  const barWidth = 320;
  const x = (GAME_WIDTH - barWidth) / 2;
  const y = GAME_HEIGHT / 2;
  const label = addText(scene, GAME_WIDTH / 2, y - 30, 'Loading...', {
    fontSize: '20px',
    color: COLORS.muted,
  }).setOrigin(0.5);
  const track = scene.add.rectangle(x, y, barWidth, 12, COLORS.panel).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(x, y, 0, 12, COLORS.arenaBorder).setOrigin(0, 0.5);

  scene.load.on('progress', (value: number) => fill.setSize(barWidth * value, 12));
  // Remove the bar before the scene builds itself, so it never sits under the scene. The scene's
  // 'create' event fires even when everything was already cached and nothing had to load.
  scene.events.once('create', () => [label, track, fill].forEach((o) => o.destroy()));
}
