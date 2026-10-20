import Phaser from 'phaser';
import { classIconKey } from '../assets/manifest';
import { CLASSES } from '../game/classes';
import type { ClassId } from '../game/player';

const TEXTURE_SIZE = 128;
/** Fraction trimmed off each edge so the icon's own square frame doesn't show in the circle. */
const EDGE_TRIM = 0.06;
const BORDER_WIDTH = 3;

const circularKey = (id: ClassId): string => `${classIconKey(id)}-circle`;

/** Builds (once) a circle-cropped copy of a class icon and returns its texture key. */
function ensureCircularIcon(scene: Phaser.Scene, id: ClassId): string {
  const key = circularKey(id);
  if (scene.textures.exists(key)) return key;

  const source = scene.textures.get(classIconKey(id)).getSourceImage() as CanvasImageSource & {
    width: number;
    height: number;
  };
  const texture = scene.textures.createCanvas(key, TEXTURE_SIZE, TEXTURE_SIZE);
  if (!texture) throw new Error(`Could not create texture "${key}"`);

  const ctx = texture.getContext();
  const half = TEXTURE_SIZE / 2;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.clip();
  const trimX = source.width * EDGE_TRIM;
  const trimY = source.height * EDGE_TRIM;
  ctx.drawImage(
    source,
    trimX,
    trimY,
    source.width - trimX * 2,
    source.height - trimY * 2,
    0,
    0,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
  );
  texture.refresh();
  return key;
}

/**
 * The player's on-screen marker: their class icon cropped to a circle, ringed in the class
 * colour. `size` is the outer diameter. Move it by setting the container's position.
 */
export function createPlayerToken(
  scene: Phaser.Scene,
  x: number,
  y: number,
  classId: ClassId,
  size: number,
): Phaser.GameObjects.Container {
  const image = scene.add
    .image(0, 0, ensureCircularIcon(scene, classId))
    .setDisplaySize(size, size);
  const ring = scene.add.circle(0, 0, size / 2 - BORDER_WIDTH / 2);
  ring.setStrokeStyle(BORDER_WIDTH, CLASSES[classId].color);
  return scene.add.container(x, y, [image, ring]);
}
