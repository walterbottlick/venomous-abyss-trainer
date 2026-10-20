import Phaser from 'phaser';
import { classIconKey } from '../assets/manifest';
import { CLASSES } from '../game/classes';
import type { ClassId } from '../game/player';

const TEXTURE_SIZE = 128;
const BORDER_WIDTH = 3;

/**
 * Radius of the visible icon art, as a fraction of the token's radius. Just inside the coloured
 * ring, so the icon fills the circle. The icon's square corners lie beyond this and are dropped.
 */
const ART_RADIUS = 0.75;

/**
 * Width, in texture pixels, of the black-to-transparent fade around the rim of the art. The
 * texture is 128px, so 8px is 2px at the 32px size the token is shown at.
 */
const EDGE_FADE = 8;

const circularKey = (id: ClassId): string => `${classIconKey(id)}-circle`;

/**
 * Builds (once) a circular version of a class icon and returns its texture key: the icon on an
 * opaque black disc, with its rim fading to black so art that runs to the icon's very edge
 * (mage, paladin) blends into the backing instead of ending in a hard line.
 */
function ensureCircularIcon(scene: Phaser.Scene, id: ClassId): string {
  const key = circularKey(id);
  if (scene.textures.exists(key)) return key;

  const source = scene.textures.get(classIconKey(id)).getSourceImage() as CanvasImageSource;
  const texture = scene.textures.createCanvas(key, TEXTURE_SIZE, TEXTURE_SIZE);
  if (!texture) throw new Error(`Could not create texture "${key}"`);

  const ctx = texture.getContext();
  const half = TEXTURE_SIZE / 2;
  const artRadius = half * ART_RADIUS;

  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.clip();

  // Opaque black behind everything, so nothing underneath shows through transparent art.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  // The icon is square, sized so the circle of `artRadius` just fits inside it.
  ctx.drawImage(source, half - artRadius, half - artRadius, artRadius * 2, artRadius * 2);

  // Clear in the middle, opaque black at `artRadius`, and black beyond (canvas gradients extend
  // their end colours), which also hides the icon's corners.
  const fade = ctx.createRadialGradient(half, half, artRadius - EDGE_FADE, half, half, artRadius);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  texture.refresh();
  return key;
}

/**
 * The player's on-screen marker: their class icon on a black disc, ringed in the class colour.
 * `size` is the outer diameter. Move it by setting the container's position. The ring is its own
 * object drawn on top, so the fade never dims it.
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
