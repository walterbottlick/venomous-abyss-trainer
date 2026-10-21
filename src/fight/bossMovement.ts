import { distance, towards } from '../game/geometry';
import type { Vec2 } from '../game/movement';

/**
 * How a boss gets from where it spawns to where the fight happens. The default for every fight:
 *
 *  1. `meeting`: the boss runs toward the tanks while the tanks run toward it.
 *  2. Once a tank touches the boss, the tanks take it to its final spot (`relocating`).
 *  3. `arrived`: it is in position and stays there.
 *
 * A boss with no destination never moves (`static`).
 */
export type BossMovementState = 'waiting' | 'meeting' | 'relocating' | 'arrived' | 'static';

export interface BossMovementOptions {
  start: Vec2;
  /** Where the tanks take the boss. Leave out for a boss that stays put. */
  destination?: Vec2;
  /** Pixels per second while running toward the tanks, and while being moved into position. */
  runSpeed: number;
  relocateSpeed: number;
  /** A tank this close (edge to edge, in pixels) to the boss counts as being in contact. */
  contactDistance: number;
}

export class BossMovement {
  state: BossMovementState;
  position: Vec2;
  private destination?: Vec2;

  constructor(private readonly options: BossMovementOptions) {
    this.position = { ...options.start };
    this.destination = options.destination;
    this.state = options.destination ? 'waiting' : 'static';
  }

  /** True once the boss is where it will fight (straight away, for a boss that never moves). */
  get inPosition(): boolean {
    return this.state === 'arrived' || this.state === 'static';
  }

  /** The tanks take the boss somewhere new. It moves there at the relocating speed. */
  moveTo(destination: Vec2): void {
    this.destination = { ...destination };
    if (this.state === 'arrived' || this.state === 'static') this.state = 'relocating';
  }

  /** The countdown is over: start running toward the tanks. */
  begin(): void {
    if (this.state === 'waiting') this.state = 'meeting';
  }

  /**
   * Advance by `dtSeconds`. `tanks` are the tanks' current centres, with their radii; the boss
   * runs toward the nearest one. `bossRadius` is the boss's icon radius.
   */
  update(dtSeconds: number, tanks: readonly { pos: Vec2; radius: number }[], bossRadius: number) {
    if (this.state === 'meeting') {
      const nearest = this.nearestTank(tanks);
      if (!nearest) return;
      const gap = distance(this.position, nearest.pos) - bossRadius - nearest.radius;
      if (gap <= this.options.contactDistance) {
        this.state = 'relocating';
      } else {
        this.position = towards(this.position, nearest.pos, this.options.runSpeed * dtSeconds);
      }
    }

    if (this.state === 'relocating') {
      const destination = this.destination!;
      const remaining = distance(this.position, destination);
      const stride = this.options.relocateSpeed * dtSeconds;
      if (remaining <= stride) {
        this.position = { ...destination };
        this.state = 'arrived';
      } else {
        this.position = towards(this.position, destination, stride);
      }
    }
  }

  private nearestTank(tanks: readonly { pos: Vec2; radius: number }[]) {
    let best: { pos: Vec2; radius: number } | undefined;
    let bestDistance = Infinity;
    for (const tank of tanks) {
      const d = distance(this.position, tank.pos);
      if (d < bestDistance) {
        best = tank;
        bestDistance = d;
      }
    }
    return best;
  }
}
