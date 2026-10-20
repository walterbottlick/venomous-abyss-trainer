import Phaser from 'phaser';
import { roleIconKey, type RoleIconId } from '../assets/manifest';
import type { PlayerChoice } from '../game/player';
import { moveToward, type Vec2 } from '../game/movement';
import {
  FOLLOW_FACTOR,
  IDLE_PAUSE_SECONDS,
  IDLE_RADIUS,
  IDLE_SPEED,
  NPC_MOVE_SPEED,
} from './config';
import { npcRoles } from './composition';
import { createIdle, stepIdle, type IdleState } from './idle';
import { computeSlots } from './layout';
import type { RaidRole } from './types';

const ICON_FOR_ROLE: Record<RaidRole, RoleIconId> = {
  tank: 'tank',
  healer: 'healer',
  melee: 'melee-dps',
  ranged: 'ranged-dps',
};

export interface RaidGroupOptions {
  choice: PlayerChoice;
  /** Where the boss stands when the fight starts. */
  boss: Vec2;
  bossRadius: number;
  /** Diameter of an NPC icon. */
  npcSize: number;
  arena: { width: number; height: number };
  /** Random source in [0, 1). Defaults to Math.random; pass a seeded one for repeatable tests. */
  random?: () => number;
}

interface Member {
  role: RaidRole;
  image: Phaser.GameObjects.Image;
  /** Standing spot at the start of the fight. */
  home: Vec2;
  /** Where the NPC currently is, without idle wandering. */
  pos: Vec2;
  idle: IdleState;
}

/**
 * The NPC members of the raid: every role except the player's own slot, shown as generic role
 * icons. They stand around the boss, wander slightly while idle, and (when the boss moves)
 * follow it according to FOLLOW_FACTOR. They ignore the player and do not collide with it.
 */
export class RaidGroup {
  private readonly members: Member[] = [];
  private readonly bossStart: Vec2;
  private readonly random: () => number;

  constructor(scene: Phaser.Scene, options: RaidGroupOptions) {
    const { choice, boss, bossRadius, npcSize, arena } = options;
    this.bossStart = { ...boss };
    this.random = options.random ?? Math.random;

    const slots = computeSlots({
      roles: npcRoles(choice),
      boss,
      bossRadius,
      npcRadius: npcSize / 2,
      arena,
    });

    for (const slot of slots) {
      const image = scene.add
        .image(slot.home.x, slot.home.y, roleIconKey(ICON_FOR_ROLE[slot.role]))
        .setDisplaySize(npcSize, npcSize);
      this.members.push({
        role: slot.role,
        image,
        home: slot.home,
        pos: { ...slot.home },
        idle: createIdle(this.random, IDLE_PAUSE_SECONDS),
      });
    }
  }

  /** Advance the raid by one frame. `boss` is the boss's current position. */
  update(dtSeconds: number, boss: Vec2): void {
    const bossShift = { x: boss.x - this.bossStart.x, y: boss.y - this.bossStart.y };

    for (const member of this.members) {
      const follow = FOLLOW_FACTOR[member.role];
      const target = {
        x: member.home.x + bossShift.x * follow,
        y: member.home.y + bossShift.y * follow,
      };
      member.pos = moveToward(member.pos, target, NPC_MOVE_SPEED * dtSeconds);

      member.idle = stepIdle(member.idle, dtSeconds, {
        radius: IDLE_RADIUS[member.role],
        speed: IDLE_SPEED,
        pause: IDLE_PAUSE_SECONDS,
        random: this.random,
      });

      member.image.setPosition(
        member.pos.x + member.idle.offset.x,
        member.pos.y + member.idle.offset.y,
      );
    }
  }
}
