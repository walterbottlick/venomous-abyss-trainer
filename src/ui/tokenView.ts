import Phaser from 'phaser';
import {
  CLICK_PADDING,
  DEATH_DARKEN_ALPHA,
  DEATH_DARKEN_COLOR,
  DEATH_FADE_SECONDS,
  DEATH_LINGER_SECONDS,
  DISPEL_OVERLAY_ALPHA,
  DISPEL_OVERLAY_COLOR,
  ENRAGE_OVERLAY_COLOR,
  ENRAGE_OVERLAY_MAX_ALPHA,
  ENRAGE_PULSE_SECONDS,
  HEAL_FLASH_COLOR,
  HEAL_FLASH_SECONDS,
  HEAL_FLASH_START_ALPHA,
  HEALTH_RING_WIDTH,
  LOW_HEALTH_OVERLAY_COLOR,
  LOW_HEALTH_OVERLAY_MAX_ALPHA,
  LOW_HEALTH_PULSE_SECONDS,
} from '../fight/config';
import { ringArc } from './ring';

export interface TokenOptions {
  x: number;
  y: number;
  /** Outer diameter, including the health ring. */
  size: number;
  ringColor: number;
  /** The icon shown inside the ring. */
  art: { key: string; size: number; /** Put a black disc behind the icon. */ backing?: boolean };
  /** Texture drawn over the icon when the token dies. Never larger than the icon. */
  crossKey: string;
  /** Whether the token fades away and is removed some time after dying. */
  removeAfterDeath: boolean;
}

export type ClickButton = 'left' | 'right';

/** 0 -> 1 -> 0 over one cycle, for fading in and out. `phase` is the position in the cycle. */
const pulse = (phase: number): number => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

/**
 * A round icon in the arena with a health ring around it and the coloured overlays the fight
 * uses: red pulse at low health, green flash when healed, blue when debuffed, white pulse when
 * enraged, and the dark cross when dead. It only draws; the rules live in `Fight`.
 */
export class TokenView {
  readonly container: Phaser.GameObjects.Container;

  private readonly size: number;
  private readonly ringColor: number;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly lowHealth: Phaser.GameObjects.Arc;
  private readonly healFlash: Phaser.GameObjects.Arc;
  private readonly debuff: Phaser.GameObjects.Arc;
  private readonly enrage: Phaser.GameObjects.Arc;
  private readonly dark: Phaser.GameObjects.Arc;
  private readonly cross: Phaser.GameObjects.Image;
  private readonly hit: Phaser.GameObjects.Arc;
  private readonly removeAfterDeath: boolean;

  private healthFraction = 1;
  private drawnFraction = -1; // forces the first draw
  private lowHealthOn = false;
  private lowHealthPhase = 0;
  private healLeft = 0;
  private debuffed = false;
  private enraged = false;
  private enragePhase = 0;
  private dead = false;
  private deadFor = 0;
  private removed = false;

  constructor(scene: Phaser.Scene, options: TokenOptions) {
    const { x, y, size, art } = options;
    this.size = size;
    this.ringColor = options.ringColor;
    this.removeAfterDeath = options.removeAfterDeath;
    const radius = size / 2;

    const children: Phaser.GameObjects.GameObject[] = [];
    if (art.backing) children.push(scene.add.circle(0, 0, radius, 0x000000));
    children.push(scene.add.image(0, 0, art.key).setDisplaySize(art.size, art.size));

    const overlay = (color: number): Phaser.GameObjects.Arc =>
      scene.add.circle(0, 0, radius, color).setAlpha(0);
    this.lowHealth = overlay(LOW_HEALTH_OVERLAY_COLOR);
    this.healFlash = overlay(HEAL_FLASH_COLOR);
    this.debuff = overlay(DISPEL_OVERLAY_COLOR);
    this.enrage = overlay(ENRAGE_OVERLAY_COLOR);
    this.dark = overlay(DEATH_DARKEN_COLOR);
    // The cross is as big as the icon underneath it, and no bigger.
    this.cross = scene.add.image(0, 0, options.crossKey).setDisplaySize(art.size, art.size);
    this.cross.setAlpha(0);
    this.ring = scene.add.graphics();
    // Nearly invisible, but still clickable. A fully transparent object would not be hit.
    this.hit = scene.add.circle(0, 0, radius + CLICK_PADDING, 0xffffff, 0.001);

    children.push(
      this.lowHealth,
      this.healFlash,
      this.debuff,
      this.enrage,
      this.dark,
      this.cross,
      this.ring,
      this.hit,
    );
    this.container = scene.add.container(x, y, children);
    this.drawRing();
  }

  get position(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  /** True once a dead token has faded out completely. The owner should destroy it. */
  get isGone(): boolean {
    return this.removed;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /** Health as a fraction of the maximum, 0 to 1. Redraws the ring when it changes. */
  setHealthFraction(fraction: number): void {
    this.healthFraction = fraction;
  }

  setLowHealth(on: boolean): void {
    if (on && !this.lowHealthOn) this.lowHealthPhase = 0; // always start the pulse from clear
    this.lowHealthOn = on;
  }

  setDebuffed(on: boolean): void {
    this.debuffed = on;
  }

  setEnraged(on: boolean): void {
    if (on && !this.enraged) this.enragePhase = 0;
    this.enraged = on;
  }

  /** Shows the green flash, which fades out over HEAL_FLASH_SECONDS. */
  flashHeal(): void {
    this.healLeft = HEAL_FLASH_SECONDS;
  }

  /** Darkens the icon and puts the cross on it. NPCs then fade out and are removed. */
  die(): void {
    this.dead = true;
  }

  /** Calls `handler` when the token is clicked with the left or right mouse button. */
  onClick(handler: (button: ClickButton) => void): void {
    this.hit.setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      handler(pointer.button === 2 ? 'right' : 'left'),
    );
  }

  /** Advance the animations by `dtSeconds`. */
  update(dtSeconds: number): void {
    if (this.removed) return;

    if (this.healthFraction !== this.drawnFraction) this.drawRing();

    if (this.dead) {
      this.updateDead(dtSeconds);
      return;
    }

    if (this.lowHealthOn) {
      this.lowHealthPhase = (this.lowHealthPhase + dtSeconds / LOW_HEALTH_PULSE_SECONDS) % 1;
      this.lowHealth.setAlpha(LOW_HEALTH_OVERLAY_MAX_ALPHA * pulse(this.lowHealthPhase));
    } else {
      this.lowHealth.setAlpha(0);
    }

    if (this.healLeft > 0) {
      this.healLeft = Math.max(0, this.healLeft - dtSeconds);
      this.healFlash.setAlpha(HEAL_FLASH_START_ALPHA * (this.healLeft / HEAL_FLASH_SECONDS));
    } else {
      this.healFlash.setAlpha(0);
    }

    this.debuff.setAlpha(this.debuffed ? DISPEL_OVERLAY_ALPHA : 0);

    if (this.enraged) {
      this.enragePhase = (this.enragePhase + dtSeconds / ENRAGE_PULSE_SECONDS) % 1;
      this.enrage.setAlpha(ENRAGE_OVERLAY_MAX_ALPHA * pulse(this.enragePhase));
    } else {
      this.enrage.setAlpha(0);
    }
  }

  destroy(): void {
    this.container.destroy();
  }

  private updateDead(dtSeconds: number): void {
    for (const o of [this.lowHealth, this.healFlash, this.debuff, this.enrage]) o.setAlpha(0);
    this.dark.setAlpha(DEATH_DARKEN_ALPHA);
    this.cross.setAlpha(1);

    if (!this.removeAfterDeath) return;
    this.deadFor += dtSeconds;
    const fade = (this.deadFor - DEATH_LINGER_SECONDS) / DEATH_FADE_SECONDS;
    if (fade > 0) this.container.setAlpha(Math.max(0, 1 - fade));
    if (fade >= 1) {
      this.removed = true;
      this.container.setVisible(false);
    }
  }

  private drawRing(): void {
    this.drawnFraction = this.healthFraction;
    this.ring.clear();
    const arc = ringArc(this.healthFraction);
    if (!arc) return;
    this.ring.lineStyle(HEALTH_RING_WIDTH, this.ringColor, 1);
    this.ring.beginPath();
    // Sits on the token's outer edge, like the player's class-coloured border.
    this.ring.arc(0, 0, this.size / 2 - HEALTH_RING_WIDTH / 2, arc.start, arc.end, false);
    this.ring.strokePath();
  }
}
