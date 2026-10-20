import Phaser from 'phaser';
import { roleIconFor, roleIconKey } from '../../assets/manifest';
import { CLASSES } from '../../game/classes';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COLORS,
  PANEL_WIDTH,
  PANEL_X,
  PLAYER_SIZE,
} from '../../game/config';
import { directionFromInput, step, type Vec2 } from '../../game/movement';
import { NPC_SIZE_RATIO } from '../../raid/config';
import { RaidGroup } from '../../raid/RaidGroup';
import { createButton } from '../../ui/button';
import { showLoadingBar } from '../../ui/loading';
import { createPlayerToken } from '../../ui/playerToken';
import { addText, navigate, setupLogicalCamera } from '../../ui/render';
import type { BossSceneData } from '../types';
import { loadVashnikAssets, VASHNIK_ASSETS } from './assets';

const PLAYER_RADIUS = PLAYER_SIZE / 2;
const PLAYER_SPEED = 220; // px per second
const BOSS_SIZE = PLAYER_SIZE * 1.5;
const NPC_SIZE = PLAYER_SIZE * NPC_SIZE_RATIO;
// Stand-in until the encounter decides where the boss goes (and later moves it).
const BOSS_START: Vec2 = { x: ARENA_WIDTH / 2, y: 110 };
const PANEL_PADDING = 20;

type Key = Phaser.Input.Keyboard.Key;
type MoveKeys = Record<'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'left' | 'right', Key>;

const startPosition = (): Vec2 => ({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT * 0.75 });

export class VashnikScene extends Phaser.Scene {
  private sceneData!: BossSceneData;
  private player!: Phaser.GameObjects.Container;
  private pos: Vec2 = startPosition();
  private keys!: MoveKeys;
  private bossPos: Vec2 = { ...BOSS_START };
  private raid!: RaidGroup;

  constructor() {
    super('VashnikScene');
  }

  init(data: BossSceneData): void {
    this.sceneData = data;
    this.pos = startPosition();
  }

  preload(): void {
    showLoadingBar(this);
    loadVashnikAssets(this.load);
  }

  create(): void {
    setupLogicalCamera(this);

    // The background art is 1114x870, the same shape as the arena, so it fits without cropping.
    this.add
      .image(0, 0, VASHNIK_ASSETS.background)
      .setOrigin(0)
      .setDisplaySize(ARENA_WIDTH, ARENA_HEIGHT);
    this.add.rectangle(PANEL_X, 0, PANEL_WIDTH, ARENA_HEIGHT, COLORS.panel).setOrigin(0);

    this.bossPos = { ...BOSS_START };
    this.add
      .image(this.bossPos.x, this.bossPos.y, VASHNIK_ASSETS.boss)
      .setDisplaySize(BOSS_SIZE, BOSS_SIZE);

    const { choice } = this.sceneData;
    const info = CLASSES[choice.classId];

    // Added before the player so the player's icon is always drawn on top.
    this.raid = new RaidGroup(this, {
      choice,
      boss: this.bossPos,
      bossRadius: BOSS_SIZE / 2,
      npcSize: NPC_SIZE,
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    });

    this.player = createPlayerToken(this, this.pos.x, this.pos.y, choice.classId, PLAYER_SIZE);

    this.buildPanel(info.name);

    const keyboard = this.input.keyboard!;
    // Both WASD and arrow keys always work. Keys are named by the object keys given here.
    this.keys = keyboard.addKeys({
      w: 'W',
      a: 'A',
      s: 'S',
      d: 'D',
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
    }) as MoveKeys;
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
      maxX: ARENA_WIDTH - PLAYER_RADIUS,
      maxY: ARENA_HEIGHT - PLAYER_RADIUS,
    });
    this.player.setPosition(this.pos.x, this.pos.y);
    this.raid.update(deltaMs / 1000, this.bossPos);
  }

  private buildPanel(className: string): void {
    const x = PANEL_X + PANEL_PADDING;
    const wrap = { wordWrap: { width: PANEL_WIDTH - PANEL_PADDING * 2 } };

    addText(this, x, 20, 'Vashnik the Malignant', {
      fontSize: '22px',
      color: COLORS.text,
      ...wrap,
    });

    this.add
      .image(x + 12, 96, roleIconKey(roleIconFor(this.sceneData.choice)))
      .setDisplaySize(24, 24);
    addText(this, x + 32, 96, `${className}\n${this.describeRole()}`, {
      fontSize: '14px',
      color: COLORS.muted,
    }).setOrigin(0, 0.5);

    addText(this, x, 150, 'Move with WASD or the arrow keys.\n\nMechanics coming soon.', {
      fontSize: '14px',
      color: COLORS.text,
      ...wrap,
    });

    createButton(
      this,
      PANEL_X + PANEL_WIDTH / 2,
      ARENA_HEIGHT - 40,
      'Back to bosses',
      () => navigate(this, 'BossSelectScene', this.sceneData),
      { width: PANEL_WIDTH - PANEL_PADDING * 2 },
    );
  }

  private describeRole(): string {
    const { role, range } = this.sceneData.choice;
    return role === 'healer' ? 'Healer' : `${range === 'melee' ? 'Melee' : 'Ranged'} DPS`;
  }
}
