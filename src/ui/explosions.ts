import Phaser from 'phaser';
import type { Vec2 } from '../game/movement';

interface Blast {
  shape: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  radius: number;
  seconds: number;
  elapsed: number;
}

/**
 * Simple explosions: a bright disc and a ring that swell out to `radius` while fading away.
 * `spawn` starts one; call `update` every frame.
 */
export class Explosions {
  private blasts: Blast[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(at: Vec2, color: number, radius: number, seconds: number = 0.45): void {
    const shape = this.scene.add.circle(at.x, at.y, radius, color, 0.7).setDepth(600);
    const ring = this.scene.add
      .circle(at.x, at.y, radius)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setFillStyle()
      .setDepth(600);
    this.blasts.push({ shape, ring, radius, seconds, elapsed: 0 });
    shape.setScale(0.2);
    ring.setScale(0.2);
  }

  update(dtSeconds: number): void {
    this.blasts = this.blasts.filter((b) => {
      b.elapsed += dtSeconds;
      const t = b.elapsed / b.seconds;
      if (t >= 1) {
        b.shape.destroy();
        b.ring.destroy();
        return false;
      }
      // Quick at first, then easing out.
      const grow = 0.2 + 0.8 * (1 - (1 - t) * (1 - t));
      b.shape.setScale(grow).setAlpha(0.7 * (1 - t));
      b.ring.setScale(Math.min(1.25, grow * 1.25)).setAlpha(1 - t);
      return true;
    });
  }
}
