import type { Vec2 } from '../game/movement';
import type { NpcTargetAdjuster } from '../raid/RaidGroup';
import type { Fight } from './Fight';

/** Something other than the boss that the raid can attack, like one of Vashnik's minions. */
export interface FocusTarget {
  id: string;
  pos: Vec2;
  /** Radius of its icon, for working out range. */
  radius: number;
}

/** What a boss's own rules can see about the fight each frame. */
export interface EncounterContext {
  fight: Fight;
  bossPos: Vec2;
  /** True once the boss has reached the spot it fights from (straight away if it never moves). */
  bossInPosition: boolean;
  /** Where the player is, and the radius of their icon. */
  playerPos: Vec2;
  playerRadius: number;
  /** The radius of an NPC raider's icon. */
  npcRadius: number;
  /** Where an NPC is, or undefined once it is gone. */
  npcPos(id: string): Vec2 | undefined;
  /** The tanks take the boss to a new spot (it follows them there at its relocating speed). */
  moveBoss(destination: Vec2): void;
  /** The living tanks (NPCs), in a steady order. */
  tanks(): { id: string; pos: Vec2 }[];
}

/**
 * A boss's own mechanics, plugged into `FightRuntime`. The runtime handles everything every boss
 * shares (the countdown, the raid walking to its spots, the boss moving, healing, the log and the
 * end screens); an encounter adds what is special: hazards, adds, and anything else.
 */
export interface Encounter {
  /** Called every frame once the fight is going, after the fight's own rules have run. */
  update(dtSeconds: number, context: EncounterContext): void;

  /** Everything besides the boss that can currently be focused. */
  focusTargets(): FocusTarget[];

  /** Optional: changes where an NPC heads (stay out of hazards, chase an add...). */
  adjustNpcTarget?: NpcTargetAdjuster;
}
