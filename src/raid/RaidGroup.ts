import Phaser from 'phaser';
import { markerKey, roleIconKey, type RoleIconId } from '../assets/manifest';
import { HEALTH_RING_COLOR, HEALTH_RING_WIDTH } from '../fight/config';
import { npcId, type Fight } from '../fight/Fight';
import { clampToArea, distance } from '../game/geometry';
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

/** What a fight's own rules get to know about an NPC when deciding where it should go. */
export interface NpcInfo {
  id: string;
  role: RaidRole;
  /** Where the NPC is right now. */
  pos: Vec2;
  /** The NPC's normal spot around the boss (already following the boss as it moves). */
  spot: Vec2;
  /** Diameter of the NPC's icon. */
  size: number;
}

/** Lets a fight change where an NPC is headed: keep out of hazards, chase an add, and so on. */
export type NpcTargetAdjuster = (npc: NpcInfo, target: Vec2) => Vec2;

export interface RaidGroupOptions {
  choice: PlayerChoice;
  /** The fight these NPCs belong to; each NPC's health, death and so on are read from it. */
  fight: Fight;
  /** Where the boss stands when the fight starts. Standing spots are worked out around it. */
  boss: Vec2;
  bossRadius: number;
  /** Diameter of an NPC icon. */
  npcSize: number;
  arena: { width: number; height: number };
  /** Where each NPC begins (the raid's huddle), by NPC index. They walk to their spots from here. */
  startPositions: readonly Vec2[];
  /** Optional: changes where an NPC heads each frame. See `NpcTargetAdjuster`. */
  adjustTarget?: NpcTargetAdjuster;
  /** Random source in [0, 1). Defaults to Math.random; pass a seeded one for repeatable tests. */
  random?: () => number;
}

interface Member {
  /** This NPC's id in the fight (`npcId(i)`). */
  id: string;
  role: RaidRole;
  token: TokenView;
  /** Standing spot, worked out around the boss's starting position. */
  home: Vec2;
  /** Where the NPC currently is, without idle wandering. */
  pos: Vec2;
  idle: IdleState;
}

/** An NPC this close to where it is headed counts as having arrived, and starts idling. */
const ARRIVED_DISTANCE = 1.5;

/**
 * The NPC members of the raid: every role except the player's own slot, shown as generic role
 * icons inside a health ring. They start huddled together, then walk to their spots around the
 * boss, wander slightly while idle, and follow the boss when it moves (see FOLLOW_FACTOR). They
 * ignore the player and do not collide with it. A dead NPC stops moving, and is removed once its
 * token has faded away.
 */
export class RaidGroup {
  private members: Member[] = [];
  private readonly bossStart: Vec2;
  private readonly random: () => number;
  private readonly fight: Fight;
  private readonly npcSize: number;
  private readonly arena: { width: number; height: number };
  private readonly adjustTarget?: NpcTargetAdjuster;

  constructor(scene: Phaser.Scene, options: RaidGroupOptions) {
    const { choice, boss, bossRadius, npcSize, arena } = options;
    this.fight = options.fight;
    this.npcSize = npcSize;
    this.arena = arena;
    this.bossStart = { ...boss };
    this.random = options.random ?? Math.random;
    this.adjustTarget = options.adjustTarget;

    const slots = computeSlots({
      roles: npcRoles(choice),
      boss,
      bossRadius,
      npcRadius: npcSize / 2,
      arena,
    });

    for (const slot of slots) {
      const start = options.startPositions[slot.index] ?? slot.home;
      const token = new TokenView(scene, {
        x: start.x,
        y: start.y,
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
        pos: { ...start },
        idle: createIdle(this.random, IDLE_PAUSE_SECONDS),
      });
    }
  }

  /** The token for an NPC, or undefined once it has died and been removed. */
  tokenFor(id: string): TokenView | undefined {
    return this.members.find((m) => m.id === id)?.token;
  }

  /** Where an NPC is drawn right now, or undefined once it has been removed. */
  positionOf(id: string): Vec2 | undefined {
    return this.tokenFor(id)?.position;
  }

  /** Pulls a point back inside the arena, leaving room for the NPC's whole icon. */
  private insideArena(point: Vec2): Vec2 {
    return clampToArea(point, this.arena.width, this.arena.height, this.npcSize / 2);
  }

  /** Advance the raid by one frame. `boss` is the boss's current position. */
  update(dtSeconds: number, boss: Vec2): void {
    const bossShift = { x: boss.x - this.bossStart.x, y: boss.y - this.bossStart.y };

    for (const member of this.members) {
      // A dead NPC stays exactly where it fell.
      if (this.fight.get(member.id).alive) {
        const follow = FOLLOW_FACTOR[member.role];
        const spot = {
          x: member.home.x + bossShift.x * follow,
          y: member.home.y + bossShift.y * follow,
        };
        const wanted = this.adjustTarget
          ? this.adjustTarget(
              { id: member.id, role: member.role, pos: member.pos, spot, size: this.npcSize },
              spot,
            )
          : spot;
        // However far out a spot or a fight's adjustment points, an NPC never leaves the arena.
        const target = this.insideArena(wanted);
        member.pos = this.insideArena(moveToward(member.pos, target, NPC_MOVE_SPEED * dtSeconds));

        member.idle = stepIdle(member.idle, dtSeconds, {
          radius: IDLE_RADIUS[member.role],
          speed: IDLE_SPEED,
          pause: IDLE_PAUSE_SECONDS,
          random: this.random,
        });

        // Only wander once settled; an NPC that is still walking just walks.
        const settled = distance(member.pos, target) <= ARRIVED_DISTANCE;
        // Idle wandering is kept inside the arena too, for an NPC standing at its edge.
        const drawn = this.insideArena({
          x: member.pos.x + (settled ? member.idle.offset.x : 0),
          y: member.pos.y + (settled ? member.idle.offset.y : 0),
        });
        member.token.setPosition(drawn.x, drawn.y);
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
