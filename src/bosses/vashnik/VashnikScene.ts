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
  PLAYER_SPEED,
} from '../../game/config';
import { directionFromInput, step, type Vec2 } from '../../game/movement';
import { abilityLines } from '../../fight/abilities';
import { FightRuntime } from '../../fight/FightRuntime';
import { NPC_SIZE_RATIO } from '../../raid/config';
import { createButton } from '../../ui/button';
import { showLoadingBar } from '../../ui/loading';
import { addText, navigate, setupLogicalCamera } from '../../ui/render';
import type { BossSceneData } from '../types';
import { loadVashnikAssets, VASHNIK_ASSETS } from './assets';
import { BOSS_DESTINATION, BOSS_START, RAID_START, VASHNIK_MAX_HEALTH } from './config';
import { VashnikEncounter } from './VashnikEncounter';
import { VashnikView } from './VashnikView';

const PLAYER_RADIUS = PLAYER_SIZE / 2;
const BOSS_SIZE = PLAYER_SIZE * 1.5;
const NPC_SIZE = PLAYER_SIZE * NPC_SIZE_RATIO;
const PANEL_PADDING = 20;
/** The fight log fills the side panel from below the instructions to just above the back button. */
const LOG_BOTTOM = ARENA_HEIGHT - 70;
const LOG_GAP = 12;

type Key = Phaser.Input.Keyboard.Key;
type MoveKeys = Record<'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'left' | 'right', Key>;

export class VashnikScene extends Phaser.Scene {
  private sceneData!: BossSceneData;
  /** The player's position. Starts in the raid's huddle (set once the runtime has placed it). */
  private pos: Vec2 = { x: 0, y: 0 };
  private keys!: MoveKeys;
  private runtime!: FightRuntime;
  private view!: VashnikView;

  constructor() {
    super('VashnikScene');
  }

  init(data: BossSceneData): void {
    this.sceneData = data;
  }

  preload(): void {
    showLoadingBar(this);
    loadVashnikAssets(this.load);
  }

  create(): void {
    setupLogicalCamera(this);

    // The background art is 1114x870, the same shape as the arena, so it fits without cropping.
    // Depth -10 keeps it behind everything, including the purple circles (depth -5).
    this.add
      .image(0, 0, VASHNIK_ASSETS.background)
      .setOrigin(0)
      .setDisplaySize(ARENA_WIDTH, ARENA_HEIGHT)
      .setDepth(-10);
    this.add.rectangle(PANEL_X, 0, PANEL_WIDTH, ARENA_HEIGHT, COLORS.panel).setOrigin(0);

    const { choice } = this.sceneData;
    const info = CLASSES[choice.classId];

    // The panel text decides how much room is left for the log, so it is built first.
    const panelBottom = this.buildPanel(info.name);

    // Health, healing, attacks, death, the log and the end screens are shared by every boss fight.
    this.runtime = new FightRuntime(this, {
      choice,
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
      // Vashnik starts below the pool, runs at the tanks, and is then taken toward the corner.
      boss: {
        start: BOSS_START,
        destination: BOSS_DESTINATION,
        size: BOSS_SIZE,
        textureKey: VASHNIK_ASSETS.boss,
        maxHealth: VASHNIK_MAX_HEALTH,
      },
      raidStart: RAID_START,
      playerSize: PLAYER_SIZE,
      npcSize: NPC_SIZE,
      logArea: {
        x: PANEL_X + PANEL_PADDING,
        y: panelBottom + LOG_GAP,
        width: PANEL_WIDTH - PANEL_PADDING * 2,
        height: LOG_BOTTOM - (panelBottom + LOG_GAP),
      },
      onRetry: () => navigate(this, 'VashnikScene', this.sceneData),
      onExit: () => navigate(this, 'BossSelectScene', this.sceneData),
    });
    this.pos = { ...this.runtime.playerStart };

    // Vashnik's own mechanics: the acid pool, Imbibe, and the minions.
    const encounter = new VashnikEncounter({
      fight: this.runtime.fight,
      playerClassId: choice.classId,
    });
    this.runtime.setEncounter(encounter);
    this.view = new VashnikView(this, this.runtime, encounter);

    // TESTING ONLY (remove later): Shift + Alt + I makes Vashnik imbibe right away, and
    // Shift + Alt + B starts Catalytic Bile right away, and Shift + Alt + P starts Plague Froth.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!event.shiftKey || !event.altKey) return;
      if (event.code === 'KeyI') {
        event.preventDefault();
        encounter.triggerImbibe();
      } else if (event.code === 'KeyB') {
        event.preventDefault();
        encounter.triggerCatalyticBile();
      } else if (event.code === 'KeyP') {
        event.preventDefault();
        encounter.triggerPlagueFroth();
      }
    });

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
    const dt = deltaMs / 1000;

    // A dead player, or a finished fight, stops moving.
    if (this.runtime.playerCanAct) {
      const k = this.keys;
      const dir = directionFromInput({
        left: k.left.isDown || k.a.isDown,
        right: k.right.isDown || k.d.isDown,
        up: k.up.isDown || k.w.isDown,
        down: k.down.isDown || k.s.isDown,
      });
      this.pos = step(this.pos, dir, PLAYER_SPEED, dt, {
        minX: PLAYER_RADIUS,
        minY: PLAYER_RADIUS,
        maxX: ARENA_WIDTH - PLAYER_RADIUS,
        maxY: ARENA_HEIGHT - PLAYER_RADIUS,
      });
      this.runtime.setPlayerPosition(this.pos.x, this.pos.y);
    }

    this.runtime.update(dt);
    this.view.update(dt);
  }

  /** Builds the side panel. Returns the y just below its text, where the fight log can start. */
  private buildPanel(className: string): number {
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

    // What the player's role can do, then how to move.
    const abilities = addText(this, x, 130, abilityLines(this.sceneData.choice).join('\n'), {
      fontSize: '14px',
      color: COLORS.text,
      lineSpacing: 4,
      ...wrap,
    });
    const movement = addText(
      this,
      x,
      abilities.y + abilities.height + 12,
      'Move with WASD or the arrow keys.',
      { fontSize: '14px', color: COLORS.text, ...wrap },
    );

    createButton(
      this,
      PANEL_X + PANEL_WIDTH / 2,
      ARENA_HEIGHT - 40,
      'Back to bosses',
      () => navigate(this, 'BossSelectScene', this.sceneData),
      { width: PANEL_WIDTH - PANEL_PADDING * 2 },
    );

    return movement.y + movement.height;
  }

  private describeRole(): string {
    const { role, range } = this.sceneData.choice;
    return role === 'healer' ? 'Healer' : `${range === 'melee' ? 'Melee' : 'Ranged'} DPS`;
  }
}
