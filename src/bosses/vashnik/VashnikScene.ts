import Phaser from 'phaser';
import { CLASSES } from '../../game/classes';
import { ARENA_SIZE, COLORS, PANEL_WIDTH, PANEL_X } from '../../game/config';
import { directionFromInput, step, type Vec2 } from '../../game/movement';
import { createButton } from '../../ui/button';
import type { BossSceneData } from '../types';

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 220; // px per second

type Key = Phaser.Input.Keyboard.Key;
type MoveKeys = Phaser.Types.Input.Keyboard.CursorKeys & Record<'w' | 'a' | 's' | 'd', Key>;

export class VashnikScene extends Phaser.Scene {
  private sceneData!: BossSceneData;
  private player!: Phaser.GameObjects.Arc;
  private pos: Vec2 = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
  private keys!: MoveKeys;

  constructor() {
    super('VashnikScene');
  }

  init(data: BossSceneData): void {
    this.sceneData = data;
    this.pos = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
  }

  create(): void {
    this.add
      .rectangle(0, 0, ARENA_SIZE, ARENA_SIZE, COLORS.arena)
      .setOrigin(0)
      .setStrokeStyle(3, COLORS.arenaBorder);
    this.add.rectangle(PANEL_X, 0, PANEL_WIDTH, ARENA_SIZE, COLORS.panel).setOrigin(0);

    const info = CLASSES[this.sceneData.choice.classId];
    this.player = this.add.circle(this.pos.x, this.pos.y, PLAYER_RADIUS, info.color);

    const textX = PANEL_X + 24;
    this.add.text(textX, 24, 'Vashnik the Malignant', { fontSize: '24px', color: COLORS.text });
    this.add.text(textX, 64, `${info.name} (${this.describeRole()})`, {
      fontSize: '16px',
      color: COLORS.muted,
    });
    this.add.text(textX, 110, 'Move with WASD or the arrow keys.\nMechanics coming soon.', {
      fontSize: '16px',
      color: COLORS.text,
    });
    createButton(this, PANEL_X + PANEL_WIDTH / 2, 490, 'Back to bosses', () =>
      this.scene.start('BossSelectScene', this.sceneData),
    );

    const keyboard = this.input.keyboard!;
    this.keys = {
      ...keyboard.createCursorKeys(),
      ...(keyboard.addKeys('W,A,S,D') as Record<'w' | 'a' | 's' | 'd', Key>),
    };
  }

  update(_time: number, deltaMs: number): void {
    const k = this.keys;
    const dir = directionFromInput({
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
      up: k.up.isDown || k.w.isDown,
      down: k.down.isDown || k.s.isDown,
    });
    this.pos = step(this.pos, dir, PLAYER_SPEED, deltaMs / 1000, {
      minX: PLAYER_RADIUS,
      minY: PLAYER_RADIUS,
      maxX: ARENA_SIZE - PLAYER_RADIUS,
      maxY: ARENA_SIZE - PLAYER_RADIUS,
    });
    this.player.setPosition(this.pos.x, this.pos.y);
  }

  private describeRole(): string {
    const { role, range } = this.sceneData.choice;
    return role === 'healer' ? 'Healer' : `${range === 'melee' ? 'Melee' : 'Ranged'} DPS`;
  }
}
