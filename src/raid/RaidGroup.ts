import Phaser from 'phaser';
import { markerKey, roleIconKey, type RoleIconId } from '../assets/manifest';
import { HEALTH_RING_COLOR, HEALTH_RING_WIDTH } from '../fight/config';
import { npcId, type Fight } from '../fight/Fight';
import { moveToward, type Vec2 } from '../game/movement';
import type { PlayerChoice } from '../game/player';
import { TokenView } from '../ui/tokenView';
import { npcRoles } from './composition';
import {
  FOLLOW_FACTOR,
  IDLE_PAUSE_SECONDS,
  IDLE_RADIUS,
  IDLE_SPEED,
  NPC_MOVE_SPEED,
} from './config';
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
  /** The fight these NPCs belong to; each NPC's health, death and so on are read from it. */
  fight: Fight;
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
  /** This NPC's id in the fight (`npcId(i)`). */
  id: string;
  role: RaidRole;
  token: TokenView;
  /** Standing spot at the start of the fight. */
  home: Vec2;
  /** Where the NPC currently is, without idle wandering. */
  pos: Vec2;
  idle: IdleState;
}

/**
 * The NPC members of the raid: every role except the player's own slot, shown as generic role
 * icons inside a health ring. They stand around the boss, wander slightly while idle, and (when
 * the boss moves) follow it according to FOLLOW_FACTOR. They ignore the player and do not
 * collide with it. A dead NPC stops moving, and is removed once its token has faded away.
 */
export class RaidGroup {
  private members: Member[] = [];
  private readonly bossStart: Vec2;
  private readonly random: () => number;
  private readonly fight: Fight;

  constructor(scene: Phaser.Scene, options: RaidGroupOptions) {
    const { choice, boss, bossRadius, npcSize, arena } = options;
    this.fight = options.fight;
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
      const token = new TokenView(scene, {
        x: slot.home.x,
        y: slot.home.y,
        size: npcSize,
        ringColor: HEALTH_RING_COLOR,
        // The icon sits inside the ring, on a black disc like the player's.
        art: {
          key: roleIconKey(ICON_FOR_ROLE[slot.role]),
          size: npcSize - HEALTH_RING_WIDTH * 2,
          backing: true,
        },
        crossKey: markerKey('cross'),
        removeAfterDeath: true,
      });
      this.members.push({
        id: npcId(slot.index),
        role: slot.role,
        token,
        home: slot.home,
        pos: { ...slot.home },
        idle: createIdle(this.random, IDLE_PAUSE_SECONDS),
      });
    }
  }

  /** The token for an NPC, or undefined once it has died and been removed. */
  tokenFor(id: string): TokenView | undefined {
    return this.members.find((m) => m.id === id)?.token;
  }

  /** Advance the raid by one frame. `boss` is the boss's current position. */
  update(dtSeconds: number, boss: Vec2): void {
    const bossShift = { x: boss.x - this.bossStart.x, y: boss.y - this.bossStart.y };

    for (const member of this.members) {
      // A dead NPC stays exactly where it fell.
      if (this.fight.get(member.id).alive) {
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

        member.token.setPosition(
          member.pos.x + member.idle.offset.x,
          member.pos.y + member.idle.offset.y,
        );
      }
      member.token.update(dtSeconds);
    }

    // Drop NPCs whose tokens have finished fading out.
    this.members = this.members.filter((m) => {
      if (!m.token.isGone) return true;
      m.token.destroy();
      return false;
    });
  }
}
