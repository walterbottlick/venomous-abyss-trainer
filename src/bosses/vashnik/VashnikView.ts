import Phaser from 'phaser';
import { markerKey } from '../../assets/manifest';
import { HEALTH_RING_COLOR } from '../../fight/config';
import type { FightRuntime } from '../../fight/FightRuntime';
import { Explosions } from '../../ui/explosions';
import { TokenView } from '../../ui/tokenView';
import { VASHNIK_ASSETS } from './assets';
import {
  BURNING_EXPLOSION_COLOR,
  CATALYTIC_BILE_COLOR,
  CATALYTIC_BILE_DURATION_SECONDS,
  GRIP_LINE_COLOR,
  GRIP_LINE_WIDTH,
  MINION_EXPLOSION_RADIUS,
  MARKER_SIZE,
  MINION_SIZE,
  PLAGUE_FROTH_COLOR,
  PLAGUE_FROTH_LINE_LENGTH,
  PLAGUE_FROTH_LINE_WIDTH,
  SHROUDED_EXPLOSION_COLOR,
  ZONE_COLOR,
  ZONE_DELAY_SECONDS,
} from './config';
import {
  FROTH_DIRECTIONS,
  type Minion,
  type VashnikEncounter,
  type Zone,
} from './VashnikEncounter';

interface ZoneView {
  outline: Phaser.GameObjects.Arc;
  fill: Phaser.GameObjects.Arc;
}

/**
 * Draws Vashnik's encounter: the minions (with health rings that drain as they are hurt), the
 * purple circles, the death grip lines, the explosions, and the instruction at the top. All the
 * rules are in `VashnikEncounter`; this only looks at it.
 */
export class VashnikView {
  private readonly minionTokens = new Map<string, TokenView>();
  private readonly zoneViews = new Map<string, ZoneView>();
  private readonly grips: Phaser.GameObjects.Graphics;
  private bileView: ZoneView | null = null;
  private readonly froth: Phaser.GameObjects.Graphics;
  /** The five markers the tanks take Vashnik to. Hidden until then. */
  private readonly markerImages: Phaser.GameObjects.Image[];
  /** Malignant Totems: plain icons, with no health bar. */
  private readonly totemImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly explosions: Explosions;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: FightRuntime,
    private readonly encounter: VashnikEncounter,
  ) {
    this.grips = scene.add.graphics().setDepth(450);
    this.froth = scene.add.graphics().setDepth(460);
    // Above the background and the circles on the floor, below every icon.
    this.markerImages = encounter.markers.map((marker) =>
      scene.add
        .image(marker.pos.x, marker.pos.y, markerKey(marker.id))
        .setDisplaySize(MARKER_SIZE, MARKER_SIZE)
        .setDepth(-7)
        .setVisible(false),
    );
    this.explosions = new Explosions(scene);
  }

  update(dtSeconds: number): void {
    this.syncMinions(dtSeconds);
    this.syncZones();
    this.syncBile();
    this.drawGrips();
    this.syncTotems();
    for (const image of this.markerImages) image.setVisible(this.encounter.markersVisible);
    this.drawFroth();
    this.playEvents();
    this.explosions.update(dtSeconds);
    this.runtime.setPrompt(this.encounter.prompt);
  }

  private syncMinions(dtSeconds: number): void {
    const alive = new Set<string>();
    for (const minion of this.encounter.minions) {
      alive.add(minion.id);
      const token = this.minionTokens.get(minion.id) ?? this.createMinionToken(minion);
      token.setPosition(minion.pos.x, minion.pos.y);
      token.setHealthFraction(1 - minion.progress);
      token.setBanished(minion.state === 'banished');
      token.setFocused(this.runtime.fight.focusId === minion.id);
      token.update(dtSeconds);
    }
    // A minion that is no longer in the encounter has died: take its icon away.
    for (const [id, token] of this.minionTokens) {
      if (alive.has(id)) continue;
      token.destroy();
      this.minionTokens.delete(id);
    }
  }

  private createMinionToken(minion: Minion): TokenView {
    const token = new TokenView(this.scene, {
      x: minion.pos.x,
      y: minion.pos.y,
      size: MINION_SIZE,
      ringColor: HEALTH_RING_COLOR,
      art: {
        key:
          minion.kind === 'shrouded' ? VASHNIK_ASSETS.shroudedVenom : VASHNIK_ASSETS.burningVenom,
        size: MINION_SIZE,
      },
      crossKey: markerKey('cross'),
      removeAfterDeath: false,
    });
    // Left-click focuses it (attack it); right-click is the Death Knight's grip / Warlock's banish.
    token.onClick((button) => {
      // A healer's raid picks its own targets (see VashnikEncounter), so their clicks do nothing.
      if (button === 'left') {
        if (this.runtime.fight.player.role !== 'healer') this.runtime.focusOn(minion.id);
      } else this.encounter.playerRightClick(minion.id);
    });
    this.minionTokens.set(minion.id, token);
    return token;
  }

  /** Each circle fills in as it counts down to its explosion. */
  private syncZones(): void {
    const present = new Set<string>();
    for (const zone of this.encounter.zones) {
      present.add(zone.id);
      const view = this.zoneViews.get(zone.id) ?? this.createZoneView(zone);
      view.fill.setScale(Math.max(0.05, 1 - zone.timeLeft / ZONE_DELAY_SECONDS));
    }
    for (const [id, view] of this.zoneViews) {
      if (present.has(id)) continue;
      view.outline.destroy();
      view.fill.destroy();
      this.zoneViews.delete(id);
    }
  }

  private createZoneView(zone: Zone): ZoneView {
    // Below the icons (which sit at depth 0), above the background (depth -10).
    const outline = this.scene.add
      .circle(zone.pos.x, zone.pos.y, zone.radius, ZONE_COLOR, 0.22)
      .setStrokeStyle(2, ZONE_COLOR, 0.9)
      .setDepth(-5);
    const fill = this.scene.add
      .circle(zone.pos.x, zone.pos.y, zone.radius, ZONE_COLOR, 0.45)
      .setDepth(-4);
    const view = { outline, fill };
    this.zoneViews.set(zone.id, view);
    return view;
  }

  /** Orange lines from whoever is death gripping to what they are pulling. */
  private drawGrips(): void {
    this.grips.clear();
    const lines = this.encounter.gripLines();
    if (lines.length === 0) return;
    this.grips.lineStyle(GRIP_LINE_WIDTH, GRIP_LINE_COLOR, 1);
    for (const { from, to } of lines) {
      this.grips.beginPath();
      this.grips.moveTo(from.x, from.y);
      this.grips.lineTo(to.x, to.y);
      this.grips.strokePath();
    }
  }

  /** The green circle of Catalytic Bile, which fills in as its time runs down. */
  private syncBile(): void {
    const bile = this.encounter.bile;
    if (!bile) {
      if (this.bileView) {
        this.bileView.outline.destroy();
        this.bileView.fill.destroy();
        this.bileView = null;
      }
      return;
    }
    if (!this.bileView) {
      const outline = this.scene.add
        .circle(bile.pos.x, bile.pos.y, bile.radius, CATALYTIC_BILE_COLOR, 0.25)
        .setStrokeStyle(3, CATALYTIC_BILE_COLOR, 0.95)
        .setDepth(-6);
      const fill = this.scene.add
        .circle(bile.pos.x, bile.pos.y, bile.radius, CATALYTIC_BILE_COLOR, 0.45)
        .setDepth(-5);
      this.bileView = { outline, fill };
    }
    this.bileView.fill.setScale(
      Math.max(0.05, 1 - bile.timeLeft / CATALYTIC_BILE_DURATION_SECONDS),
    );
  }

  private syncTotems(): void {
    const present = new Set<string>();
    for (const totem of this.encounter.totems) {
      present.add(totem.id);
      if (this.totemImages.has(totem.id)) continue;
      const image = this.scene.add
        .image(totem.pos.x, totem.pos.y, VASHNIK_ASSETS.totem)
        .setDisplaySize(totem.radius * 2, totem.radius * 2);
      this.totemImages.set(totem.id, image);
    }
    for (const [id, image] of this.totemImages) {
      if (present.has(id)) continue;
      this.explosions.spawn(
        { x: image.x, y: image.y },
        PLAGUE_FROTH_COLOR,
        image.displayWidth,
        0.3,
      );
      image.destroy();
      this.totemImages.delete(id);
    }
  }

  /** Plague Froth: four short lines pointing away from each marked raider, and the circles shot out. */
  private drawFroth(): void {
    this.froth.clear();
    this.froth.lineStyle(PLAGUE_FROTH_LINE_WIDTH, PLAGUE_FROTH_COLOR, 1);
    for (const target of this.encounter.frothTargets) {
      const start = target.iconRadius + 2;
      for (const dir of FROTH_DIRECTIONS) {
        this.froth.beginPath();
        this.froth.moveTo(target.pos.x + dir.x * start, target.pos.y + dir.y * start);
        this.froth.lineTo(
          target.pos.x + dir.x * (start + PLAGUE_FROTH_LINE_LENGTH),
          target.pos.y + dir.y * (start + PLAGUE_FROTH_LINE_LENGTH),
        );
        this.froth.strokePath();
      }
    }

    this.froth.fillStyle(PLAGUE_FROTH_COLOR, 0.9);
    this.froth.lineStyle(2, 0xffffff, 0.6);
    for (const ball of this.encounter.frothBalls) {
      this.froth.fillCircle(ball.pos.x, ball.pos.y, ball.radius);
      this.froth.strokeCircle(ball.pos.x, ball.pos.y, ball.radius);
    }
  }

  private playEvents(): void {
    for (const event of this.encounter.drainEvents()) {
      if (event.type === 'bileEnded') {
        this.explosions.spawn(event.pos, event.color, event.radius * 1.3, 0.5);
      } else if (event.type === 'minionDied') {
        const color = event.kind === 'burning' ? BURNING_EXPLOSION_COLOR : SHROUDED_EXPLOSION_COLOR;
        this.explosions.spawn(event.pos, color, MINION_EXPLOSION_RADIUS);
      } else {
        this.explosions.spawn(event.pos, ZONE_COLOR, event.radius * 1.3, 0.5);
      }
    }
  }
}
