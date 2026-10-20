import Phaser from 'phaser';
import type { AttackStyle } from '../fight/attackStyles';
import {
  ARROW_SIZE,
  ARROW_WIDTH,
  BEAM_SECONDS,
  BEAM_WIDTH,
  MELEE_SWIPE_ARC_DEGREES,
  MELEE_SWIPE_OFFSET,
  MELEE_SWIPE_SECONDS,
  MELEE_SWIPE_WIDTH,
  RANGED_DOT_RADIUS,
  RANGED_DOT_SPEED,
  STAB_LENGTH,
  STAB_OFFSET,
  STAB_SECONDS,
  STAB_SPREAD_DEGREES,
  STAB_WIDTH,
  STAR_INNER_RADIUS,
  STAR_OUTER_RADIUS,
  STAR_POINTS,
  STAR_SPIN_SPEED,
} from '../fight/config';
import { moveToward, type Vec2 } from '../game/movement';

/** Returns where something is right now, so an effect can follow it as it moves. */
type Live = () => Vec2;

/** One playing animation. `update` returns false when it has finished and cleaned up after itself. */
interface Effect {
  update(dtSeconds: number): boolean;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
/** 0 -> 1 -> 0 over a progress of 0 to 1: fades in, then out. */
const fadeInOut = (progress: number): number => Math.sin(Math.min(1, progress) * Math.PI);
const angleBetween = (from: Vec2, to: Vec2): number => Math.atan2(to.y - from.y, to.x - from.x);

/** Where the animation is, and what it needs to know about both ends of the attack. */
interface Ends {
  attacker: Live;
  attackerRadius: number;
  boss: Live;
  bossRadius: number;
}

/**
 * Draws and animates DPS attacks (see `AttackStyle` for the kinds). Effects that stay on the
 * attacker (swipe, stab, beam) follow its icon as it moves. Projectiles (dot, star, arrow) leave
 * from where the attacker was and re-aim at the boss every frame, so they cannot miss.
 */
export class AttackEffects {
  private effects: Effect[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Starts an animation from the attacker toward the boss. `attacker` and `boss` return the two
   * icons' current centres, and the radii are the icons' sizes.
   */
  spawn(
    style: AttackStyle,
    attacker: Live,
    attackerRadius: number,
    boss: Live,
    bossRadius: number,
  ): void {
    const ends: Ends = { attacker, attackerRadius, boss, bossRadius };
    switch (style.kind) {
      case 'swipe':
        this.effects.push(this.swipe(style.color, ends));
        break;
      case 'stab':
        this.effects.push(this.stab(style.color, ends));
        break;
      case 'beam':
        this.effects.push(this.beam(style.color, ends));
        break;
      case 'dot':
      case 'star':
      case 'arrow':
        this.effects.push(this.projectile(style, ends));
        break;
    }
  }

  /** Advance every animation by `dtSeconds`, and remove the finished ones. */
  update(dtSeconds: number): void {
    this.effects = this.effects.filter((effect) => effect.update(dtSeconds));
  }

  /** An arc swung across the side of the attacker that faces the boss, fading as it goes. */
  private swipe(color: number, ends: Ends): Effect {
    const graphics = this.scene.add.graphics().setDepth(500);
    const radius = ends.attackerRadius + MELEE_SWIPE_OFFSET;
    const span = toRadians(MELEE_SWIPE_ARC_DEGREES);
    let elapsed = 0;

    return {
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / MELEE_SWIPE_SECONDS;
        if (progress >= 1) {
          graphics.destroy();
          return false;
        }
        // Redrawn every frame at the attacker's current spot, so it moves with the icon.
        const origin = ends.attacker();
        const start = angleBetween(origin, ends.boss()) - span / 2;
        graphics.clear();
        graphics.lineStyle(MELEE_SWIPE_WIDTH, color, 1 - progress * 0.6);
        graphics.beginPath();
        graphics.arc(origin.x, origin.y, radius, start, start + span * progress, false);
        graphics.strokePath();
        return true;
      },
    };
  }

  /** Two quick thrusts: a short line shoots toward the boss and back, twice, a little apart. */
  private stab(color: number, ends: Ends): Effect {
    const graphics = this.scene.add.graphics().setDepth(500);
    const spread = toRadians(STAB_SPREAD_DEGREES);
    const startDistance = ends.attackerRadius + STAB_OFFSET;
    let elapsed = 0;

    return {
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / STAB_SECONDS;
        if (progress >= 1) {
          graphics.destroy();
          return false;
        }
        const origin = ends.attacker();
        const toBoss = angleBetween(origin, ends.boss());
        // Each half of the animation is one thrust: out to full length, then back in.
        const first = progress < 0.5;
        const thrust = fadeInOut((progress * 2) % 1);
        const angle = toBoss + (first ? -spread : spread);
        const reach = startDistance + STAB_LENGTH * thrust;

        graphics.clear();
        graphics.lineStyle(STAB_WIDTH, color, 1);
        graphics.beginPath();
        graphics.moveTo(
          origin.x + Math.cos(angle) * startDistance,
          origin.y + Math.sin(angle) * startDistance,
        );
        graphics.lineTo(origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach);
        graphics.strokePath();
        return true;
      },
    };
  }

  /** A line joining the attacker and the boss (edge to edge) that fades in, then out. */
  private beam(color: number, ends: Ends): Effect {
    const graphics = this.scene.add.graphics().setDepth(500);
    let elapsed = 0;

    return {
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / BEAM_SECONDS;
        if (progress >= 1) {
          graphics.destroy();
          return false;
        }
        const a = ends.attacker();
        const b = ends.boss();
        const angle = angleBetween(a, b);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        graphics.clear();
        graphics.lineStyle(BEAM_WIDTH, color, fadeInOut(progress));
        graphics.beginPath();
        graphics.moveTo(a.x + cos * ends.attackerRadius, a.y + sin * ends.attackerRadius);
        graphics.lineTo(b.x - cos * ends.bossRadius, b.y - sin * ends.bossRadius);
        graphics.strokePath();
        return true;
      },
    };
  }

  /** A small shape that flies from the attacker's spot to the boss, re-aiming every frame. */
  private projectile(style: AttackStyle, ends: Ends): Effect {
    const from = ends.attacker();
    const shape = this.createProjectileShape(style, from);
    let pos: Vec2 = { ...from };
    // Arrows start pointing at the boss; they keep turning to face their direction of travel.
    shape.setRotation(angleBetween(from, ends.boss()));

    return {
      update: (dt) => {
        const target = ends.boss();
        const next = moveToward(pos, target, RANGED_DOT_SPEED * dt);
        if (style.kind === 'arrow' && (next.x !== pos.x || next.y !== pos.y)) {
          shape.setRotation(angleBetween(pos, next));
        } else if (style.kind === 'star') {
          shape.setRotation(shape.rotation + toRadians(STAR_SPIN_SPEED) * dt);
        }
        pos = next;
        shape.setPosition(pos.x, pos.y);

        // It has arrived once it touches the edge of the boss's icon.
        if (Math.hypot(target.x - pos.x, target.y - pos.y) <= ends.bossRadius) {
          shape.destroy();
          return false;
        }
        return true;
      },
    };
  }

  private createProjectileShape(
    style: AttackStyle,
    at: Vec2,
  ): Phaser.GameObjects.Arc | Phaser.GameObjects.Star | Phaser.GameObjects.Graphics {
    if (style.kind === 'star') {
      return this.scene.add
        .star(at.x, at.y, STAR_POINTS, STAR_INNER_RADIUS, STAR_OUTER_RADIUS, style.color)
        .setDepth(500);
    }
    if (style.kind === 'arrow') {
      // A ">" drawn pointing right (the direction rotation 0 faces); rotating it aims it.
      const arrow = this.scene.add.graphics().setDepth(500);
      arrow.lineStyle(ARROW_WIDTH, style.color, 1);
      arrow.beginPath();
      arrow.moveTo(-ARROW_SIZE * 0.6, -ARROW_SIZE);
      arrow.lineTo(ARROW_SIZE * 0.6, 0);
      arrow.lineTo(-ARROW_SIZE * 0.6, ARROW_SIZE);
      arrow.strokePath();
      arrow.setPosition(at.x, at.y);
      return arrow;
    }
    return this.scene.add.circle(at.x, at.y, RANGED_DOT_RADIUS, style.color).setDepth(500);
  }
}
