import type { Encounter, EncounterContext, FocusTarget } from '../../fight/encounter';
import { BOSS_ID, PLAYER_ID, type Fight } from '../../fight/Fight';
import { NPC_RANGE_METERS } from '../../fight/ranges';
import { ARENA_HEIGHT, ARENA_WIDTH, PIXELS_PER_METER } from '../../game/config';
import {
  clampToArea,
  closestPointOnPolygon,
  distance,
  distanceToPolygon,
  pointInPolygon,
  pushOutOfCircle,
  pushOutOfPolygon,
  towards,
} from '../../game/geometry';
import { moveToward, type Vec2 } from '../../game/movement';
import type { ClassId } from '../../game/player';
import type { NpcInfo } from '../../raid/RaidGroup';
import {
  BANISH_PROMPT,
  BILE_AFTER_TOTEM_RESET_SECONDS,
  BOSS_DESTINATION,
  BURNING_DEATH_DAMAGE,
  BURNING_KILL_BASE,
  BURNING_SPAWN_SPREAD,
  BURNING_KILLS_FOR_BILE,
  BURNING_VENOM_COUNT,
  CATALYTIC_BILE_AVOID_MARGIN,
  CATALYTIC_BILE_COLOR,
  CATALYTIC_BILE_DURATION_SECONDS,
  CATALYTIC_BILE_NPC_CLEARANCE,
  CATALYTIC_BILE_PROMPT,
  CATALYTIC_BILE_RADIUS,
  CATALYTIC_BILE_TOP_FRACTION,
  CATALYTIC_BILE_WARNING_SECONDS,
  DEATH_GRIP_PROMPT,
  DISPEL_PROMPT,
  ENRAGE_SECONDS,
  FIRST_FROTH_SECONDS,
  BILE_AREA,
  FIRE_FOUNTAIN,
  FOUNTAIN_AREAS,
  FOCUS_PROMPT,
  FROTH_AFTER_BILE_SECONDS,
  FROTH_AIM_PROMPT,
  FROTH_MARKER_PROMPT,
  FROTH_TOTEM_PROMPT,
  GRIP_DELAY_SECONDS,
  GRIP_LANDING_GAP,
  GRIP_SPEED,
  IMBIBE_AFTER_FROTH_SECONDS,
  EXPLODING_INFECTION_DAMAGE,
  EXPLODING_INFECTION_TICK_SECONDS,
  MALIGNANT_TOTEM_COUNT,
  MALIGNANT_TOTEM_DELAY_SECONDS,
  MALIGNANT_TOTEM_SIZE_FACTOR,
  MALIGNANT_TOTEM_SPACING,
  MALIGNANT_TOTEM_TOP_FRACTION,
  MARKER_STAND_RADIUS,
  MARKER_BOSS_OFFSET,
  MARKER_TANK_SPOT,
  MARKERS,
  MINION_MIN_SEPARATION,
  MINION_SPAWN_DELAY_SECONDS,
  MINION_SIZE,
  MINION_SPEED,
  PLAGUE_FROTH_DELAY_SECONDS,
  PLAGUE_FROTH_SPEED,
  PLAGUE_FROTH_SPREAD_DISTANCE,
  PLAGUE_FROTH_START_DISTANCE,
  PLAGUE_FROTH_TARGET_COUNT,
  POOL_AVOID_MARGIN,
  POOL_POLYGON,
  POOL_TARGET,
  SHADOW_FOUNTAIN,
  SHROUDED_KILL_BASE,
  SHROUDED_SPAWN_SPREAD,
  SHROUDED_VENOM_COUNT,
  STYGIAN_DROP_INTERVAL_SECONDS,
  STYGIAN_INFECTION_DELAY_SECONDS,
  STYGIAN_INFECTION_SECONDS,
  STYGIAN_PROMPT,
  TOTEM_RESET_COUNT,
  TOTEM_RESET_DISTANCE,
  ZONE_AVOID_MARGIN,
  ZONE_COUNT,
  ZONE_DELAY_SECONDS,
  ZONE_RADIUS,
  ZONE_TOP_FRACTION,
} from './config';

export type MinionKind = 'shrouded' | 'burning';
/** Walking toward the pool, being yanked across the room by a death grip, or banished (frozen). */
export type MinionState = 'walking' | 'pulled' | 'banished';

export interface Minion {
  id: string;
  kind: MinionKind;
  pos: Vec2;
  /** How much of the work needed to kill it is done: 0 untouched, 1 dead. */
  progress: number;
  alive: boolean;
  state: MinionState;
  /** While pulled: who is pulling it, 'player' or an NPC tank's id. */
  pulledBy?: string;
}

/** A purple circle that explodes after a delay, killing the player if they are standing in it. */
export interface Zone {
  id: string;
  pos: Vec2;
  radius: number;
  timeLeft: number;
}

/** One-off things for the screen to show. */
export type VashnikEvent =
  | { type: 'minionDied'; id: string; kind: MinionKind; pos: Vec2 }
  | { type: 'zoneExploded'; pos: Vec2; radius: number }
  | { type: 'bileEnded'; pos: Vec2; radius: number; color: number };

/** The green circle of Catalytic Bile while it is out. */
export interface Bile {
  pos: Vec2;
  radius: number;
  /** Seconds left before the check. */
  timeLeft: number;
}

/** A Malignant Totem. It stays until a Plague Froth circle destroys it. */
export interface Totem {
  id: string;
  pos: Vec2;
  radius: number;
}

/** A raider marked by Plague Froth, until its circles shoot out. */
export interface FrothTarget {
  /** PLAYER_ID or an NPC's id. */
  id: string;
  /** Where the raider is now (the lines follow them). */
  pos: Vec2;
  /** Radius of their icon. */
  iconRadius: number;
  timeLeft: number;
}

/** A green circle shot out by Plague Froth. */
export interface FrothBall {
  pos: Vec2;
  velocity: Vec2;
  radius: number;
  /** Who shot it: PLAYER_ID or an NPC's id. */
  sourceId: string;
}

/** The four diagonal directions the lines (and circles) go: NW, NE, SW, SE. */
export const FROTH_DIRECTIONS: Vec2[] = [
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
];

/** What the fight is doing or waiting for. See the order of the fight in config.ts. */
type Stage =
  | 'firstFroth' // waiting for the first Plague Froth
  | 'frothOut' // a Plague Froth is on: waiting for its circles to be gone
  | 'timer' // counting down to `nextAction`
  | 'bileOut' // Catalytic Bile is up: waiting for it to be resolved
  | 'burning' // the minions are out: waiting for the second Burning Venom to die
  | 'lastBurning'; // waiting for the last Burning Venom to die
type Action = 'imbibe' | 'bile' | 'froth';
/** What a Plague Froth asks of the raid: aim away, stand on markers, or hit the totems. */
type FrothMode = 'aim' | 'markers' | 'totems';

/** What the wipe screen says when the player is not on the empty marker. */
const MARKER_WIPE_REASON =
  "Didn't stand on the open marker. Technically this wouldn't necessarily kill you, but I'm killing you anyways for not following directions.";

export interface VashnikOptions {
  fight: Fight;
  /**
   * Whether the encounter runs the fight's order itself (Plague Froth, Imbibe, Catalytic Bile...
   * one after another). Defaults to true; tests turn it off and trigger things by hand.
   */
  scripted?: boolean;
  /** Which class the player picked: Death Knights and Warlocks get a part to play. */
  playerClassId: ClassId;
  random?: () => number;
}

const MINION_RADIUS = MINION_SIZE / 2;
const isDps = (role: string | null): boolean => role === 'melee' || role === 'ranged';

/**
 * Vashnik's own rules: the acid pool, Imbibe, and everything the fountains send out. It is plain
 * TypeScript with no graphics (see VashnikView for those), so it can be tested directly. The
 * generic parts of a fight (countdown, raid movement, healing, wipes) are in FightRuntime.
 */
export class VashnikEncounter implements Encounter {
  minions: Minion[] = [];
  zones: Zone[] = [];
  /** Instruction for the top of the screen, or null when there is none. */
  prompt: string | null = null;

  private readonly fight: Fight;
  private readonly playerClass: ClassId;
  private readonly random: () => number;
  private readonly scripted: boolean;
  private events: VashnikEvent[] = [];
  /**
   * idle: no Imbibe going on. imbibing: he has started, and the minions are about to appear.
   * active: the minions are out.
   */
  private phase: 'idle' | 'imbibing' | 'active' = 'idle';
  private spawnTimer = MINION_SPAWN_DELAY_SECONDS;
  /** Seconds until Stygian Infection goes out, counted from when the minions appear. */
  private stygianDelay: number | null = null;
  private stygianStarted = false;
  /** Whether Exploding Infection was put on the raid (it only is for a healer player). */
  private explodingInfection = false;
  /** How many Burning Venom have died since the last Imbibe. */
  private burningKilled = 0;
  private shroudedProgress = 0;
  /** Seconds until the NPCs death grip two Burning Venom; null if nobody is going to. */
  private gripTimer: number | null = null;
  private gripDone = false;
  /** The Burning Venom that was not gripped. It is banished (frozen) until the player focuses it. */
  private thirdId: string | null = null;
  private poolBreached = false;
  /** Stygian Infection: circles still to drop under the player, and the wait until the next. */
  private infectionDropsLeft = 0;
  private infectionDropTimer = 0;
  private infectionDropped = 0;
  /** Seconds until the next tick of Exploding Infection damage; null before Imbibe. */
  private infectionTickTimer: number | null = null;
  private context: EncounterContext | null = null;

  /**
   * Catalytic Bile: idle until it is time, then 'warning' (the instruction is up, no circle yet),
   * then 'out' (the circle is there, counting down), then 'done'.
   */
  private bileState: 'idle' | 'warning' | 'out' | 'done' = 'idle';
  private bileTimer = 0;
  /** The circle, once it has appeared and until its time is up. */
  bile: Bile | null = null;

  /** Malignant Totems in the arena. */
  totems: Totem[] = [];
  /** Seconds until the totems appear, counted from Imbibe; null when none are on the way. */
  private totemTimer: number | null = null;
  private totemsSpawned = 0;

  /** Seconds since the fight began. */
  private fightTime = 0;
  private stage: Stage = 'firstFroth';
  private stageTimer = 0;
  private nextAction: Action = 'imbibe';

  /** The markers, shown while the tanks have Vashnik by them. */
  readonly markers = MARKERS;
  markersVisible = false;

  /** Plague Froth: idle until it is time, then 'marked' (lines showing), then 'done'. */
  private frothState: 'idle' | 'marked' | 'done' = 'idle';
  /** How many Plague Froths have been cast. The first aims, then even ones use the markers, odd ones the totems. */
  private frothCasts = 0;
  private frothMode: FrothMode = 'aim';
  /** The markers the marked NPCs stand on, by NPC id (markers mode), and the markers left empty. */
  private frothAssign = new Map<string, number>();
  private frothEmpty: number[] = [];
  /** Raiders marked by Plague Froth, while their lines show. */
  frothTargets: FrothTarget[] = [];
  /** Circles in flight. */
  frothBalls: FrothBall[] = [];

  constructor(options: VashnikOptions) {
    this.fight = options.fight;
    this.playerClass = options.playerClassId;
    this.random = options.random ?? Math.random;
    this.scripted = options.scripted ?? true;
  }

  /** Events since the last call, oldest first. */
  drainEvents(): VashnikEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  focusTargets(): FocusTarget[] {
    return this.minions
      .filter((m) => m.alive)
      .map((m) => ({ id: m.id, pos: m.pos, radius: MINION_RADIUS }));
  }

  /** Lines from whoever is death gripping to the minion they are pulling, for drawing. */
  gripLines(): { from: Vec2; to: Vec2 }[] {
    const lines: { from: Vec2; to: Vec2 }[] = [];
    for (const m of this.minions) {
      const from = m.state === 'pulled' && m.pulledBy ? this.sourcePos(m.pulledBy) : undefined;
      if (from) lines.push({ from, to: m.pos });
    }
    return lines;
  }

  update(dtSeconds: number, context: EncounterContext): void {
    this.context = context;

    this.fightTime += dtSeconds;
    if (this.fightTime >= ENRAGE_SECONDS) this.fight.enrageBoss();

    if (this.phase === 'imbibing') {
      this.spawnTimer -= dtSeconds;
      if (this.spawnTimer <= 0) this.spawnMinions();
    }
    if (this.totemTimer !== null) {
      this.totemTimer -= dtSeconds;
      if (this.totemTimer <= 0) {
        this.totemTimer = null;
        this.spawnTotems(context);
      }
    }

    this.killRaidersInPool(context);
    this.runCatalyticBile(dtSeconds, context);
    this.runPlagueFroth(dtSeconds, context);

    if (this.phase === 'active') {
      this.runGripTimer(dtSeconds);
      this.runStygianInfection(dtSeconds);
      this.runExplodingInfectionDamage(dtSeconds);
      this.autoFocusForHealer();
      this.moveMinions(dtSeconds);
      this.applyDamage(dtSeconds);
      this.runZones(dtSeconds);
      this.checkPoolBreach();
    }
    this.runTimeline(dtSeconds, context);
    this.updatePrompt();
  }

  /** Testing: makes Vashnik imbibe right now. */
  triggerImbibe(): void {
    if (this.context) this.imbibe();
  }

  /** Testing: starts Catalytic Bile's warning right now. */
  triggerCatalyticBile(): void {
    if (this.context) {
      this.startBile();
      this.updatePrompt();
    }
  }

  /** Testing: marks the raid with Plague Froth right now (the next kind in the cycle). */
  triggerPlagueFroth(): void {
    if (this.context) this.startPlagueFroth(this.context);
  }

  // --- The order of the fight ---------------------------------------------------------------------

  /** Moves the fight along: see the order of the fight in config.ts. Does nothing when not scripted. */
  private runTimeline(dtSeconds: number, context: EncounterContext): void {
    if (!this.scripted || this.fight.status !== 'active') return;

    switch (this.stage) {
      case 'firstFroth':
        if (this.fightTime >= FIRST_FROTH_SECONDS) this.beginFroth(context);
        break;
      case 'frothOut':
        if (this.frothFinished()) this.afterFroth(context);
        break;
      case 'timer':
        this.stageTimer -= dtSeconds;
        if (this.stageTimer <= 0) this.runAction(this.nextAction, context);
        break;
      case 'bileOut':
        if (this.bileState === 'done') this.waitThen('froth', FROTH_AFTER_BILE_SECONDS);
        break;
      case 'burning':
        if (this.burningKilled >= BURNING_KILLS_FOR_BILE) this.secondBurningDied(context);
        break;
      case 'lastBurning':
        if (this.burningKilled >= BURNING_VENOM_COUNT) this.beginFroth(context);
        break;
    }
  }

  private waitThen(action: Action, seconds: number): void {
    this.stage = 'timer';
    this.nextAction = action;
    this.stageTimer = seconds;
  }

  private runAction(action: Action, context: EncounterContext): void {
    if (action === 'imbibe') {
      this.imbibe();
      this.stage = 'burning';
    } else if (action === 'bile') {
      this.startBile();
      this.stage = 'bileOut';
    } else {
      this.beginFroth(context);
    }
  }

  private beginFroth(context: EncounterContext): void {
    this.startPlagueFroth(context);
    this.stage = 'frothOut';
  }

  /** A Plague Froth is over once its circles have all left the arena. */
  private frothFinished(): boolean {
    return this.frothState === 'done' && this.frothBalls.length === 0;
  }

  private afterFroth(context: EncounterContext): void {
    if (this.frothMode === 'markers') {
      // The totems are replaced, and the tanks take Vashnik back to where he began the fight.
      this.markersVisible = false;
      this.resetTotems(context);
      context.moveBoss(BOSS_DESTINATION);
      this.waitThen('bile', BILE_AFTER_TOTEM_RESET_SECONDS);
    } else {
      this.waitThen('imbibe', IMBIBE_AFTER_FROTH_SECONDS);
    }
  }

  /** The second Burning Venom is dead: Catalytic Bile, the last one breaks free, the tanks move. */
  private secondBurningDied(context: EncounterContext): void {
    this.stage = 'lastBurning';
    this.startBile();
    for (const m of this.minions) {
      if (m.alive && m.kind === 'burning' && m.state === 'banished') m.state = 'walking';
    }
    this.takeBossToMarkers(context);
  }

  /** The tanks take Vashnik to the markers: they stand between the diamond and the star, he to their right. */
  private takeBossToMarkers(context: EncounterContext): void {
    this.markersVisible = true;
    context.moveBoss({ x: MARKER_TANK_SPOT.x + MARKER_BOSS_OFFSET, y: MARKER_TANK_SPOT.y });
  }

  // --- The player's right-click abilities ------------------------------------------------------

  /**
   * The player right-clicked a minion. A Death Knight can death grip a Burning Venom (pulling it
   * and one other to them) and a Warlock can banish the third one; for anyone else this does
   * nothing. Returns whether something happened.
   */
  playerRightClick(id: string): boolean {
    if (this.phase !== 'active' || !this.fight.player.alive || this.fight.status !== 'active') {
      return false;
    }
    const minion = this.minions.find((m) => m.id === id && m.alive);
    if (!minion || minion.kind !== 'burning') return false;

    if (this.playerClass === 'death-knight' && !this.gripDone && minion.state === 'walking') {
      this.deathGrip(minion);
      this.updatePrompt();
      return true;
    }
    if (
      this.playerClass === 'warlock' &&
      this.gripDone &&
      this.burningKilled < BURNING_KILLS_FOR_BILE &&
      minion.id === this.thirdId &&
      minion.state === 'walking'
    ) {
      minion.state = 'banished';
      this.fight.addLog('You banish a Burning Venom!');
      this.updatePrompt();
      return true;
    }
    return false;
  }

  // --- Where NPCs go ---------------------------------------------------------------------------

  /**
   * Keeps NPCs out of the pool and out of purple circles that are about to explode, and sends
   * the NPC DPS to wherever the raid is focusing (a minion) so they look like they are attacking
   * it. Tanks and healers stay where they are.
   */
  adjustNpcTarget = (npc: NpcInfo, target: Vec2): Vec2 => {
    let goal = target;
    const half = npc.size / 2;

    if (this.markersVisible) {
      // At the markers, marked NPCs stand on their own marker and stay there. Everyone else, the
      // tanks included, stands stacked between the diamond and the star, with Vashnik to their right.
      const marker = this.holdingMarkers() ? this.frothAssign.get(npc.id) : undefined;
      if (marker !== undefined) return { ...MARKERS[marker]!.pos };
      goal = { ...MARKER_TANK_SPOT };
    } else {
      const focused = this.minions.find((m) => m.alive && m.id === this.fight.focusId);
      if (focused && isDps(npc.role)) goal = this.chasePoint(npc, focused, target);

      // A marked NPC spreads out, so its circles do not pass through the others (or the player).
      if (this.frothTargets.some((t) => t.id === npc.id)) {
        goal = this.spreadOut(npc, goal);
        if (this.frothMode === 'totems') goal = this.avoidTotemLines(goal, half);
      }
    }

    // Pushing clear of one hazard can land in another, so settle it over a few passes.
    for (let pass = 0; pass < 4; pass++) {
      if (this.frothMode === 'totems') goal = this.dodgePlayerWaves(goal, half);
      goal = pushOutOfPolygon(goal, POOL_POLYGON, half + POOL_AVOID_MARGIN);
      // NPCs also step out of the Catalytic Bile if they are standing in it (only the player
      // needs to be in it).
      if (this.bile) {
        goal = pushOutOfCircle(
          goal,
          this.bile.pos,
          this.bile.radius + half + CATALYTIC_BILE_AVOID_MARGIN,
        );
      }
      for (const zone of this.zones) {
        goal = pushOutOfCircle(goal, zone.pos, zone.radius + half + ZONE_AVOID_MARGIN);
      }
    }
    return goal;
  };

  /** Where an NPC DPS should stand to hit `minion`: where it is, if already in range, else nearby. */
  private chasePoint(npc: NpcInfo, minion: Minion, spot: Vec2): Vec2 {
    const role = npc.role === 'melee' ? 'melee' : 'ranged';
    const reach = NPC_RANGE_METERS[role] * PIXELS_PER_METER;
    const half = npc.size / 2;
    const gap = distance(npc.pos, minion.pos) - half - MINION_RADIUS;
    if (gap <= reach * 0.9) return npc.pos; // already close enough: hold position

    // Stand part way into range, on the side of the minion the NPC is already on. A little
    // angle per NPC keeps them from piling onto one spot.
    const standOff = half + MINION_RADIUS + (role === 'melee' ? 4 : reach * 0.8);
    const approach = towards(minion.pos, spot, 1);
    const baseAngle = Math.atan2(approach.y - minion.pos.y, approach.x - minion.pos.x);
    const number = Number(npc.id.replace(/\D/g, '')) || 0;
    const angle = baseAngle + ((number % 5) - 2) * 0.45;
    return {
      x: minion.pos.x + Math.cos(angle) * standOff,
      y: minion.pos.y + Math.sin(angle) * standOff,
    };
  }

  // --- Imbibe ----------------------------------------------------------------------------------

  /** Vashnik starts to imbibe. The minions follow after MINION_SPAWN_DELAY_SECONDS. */
  private imbibe(): void {
    // Totems left over from the last Imbibe are not allowed: the raid is wiped out.
    if (this.totems.length > 0) {
      this.fight.addLog('Vashnik imbibes with Malignant Totems still up! The raid is wiped out!');
      for (const raider of this.fight.raiders) {
        this.fight.kill(raider.id, 'Vashnik imbibed while Malignant Totems were still up.');
      }
    }
    this.totemTimer = MALIGNANT_TOTEM_DELAY_SECONDS;

    // Start the Imbibe's effects afresh, as it comes round again and again.
    this.minions = [];
    this.shroudedProgress = 0;
    this.gripTimer = null;
    this.gripDone = false;
    this.thirdId = null;
    this.poolBreached = false;
    this.burningKilled = 0;
    this.stygianDelay = null;
    this.stygianStarted = false;
    this.infectionDropsLeft = 0;
    this.explodingInfection = false;
    this.infectionTickTimer = null;
    this.fight.setFocus(BOSS_ID);

    this.phase = 'imbibing';
    this.spawnTimer = MINION_SPAWN_DELAY_SECONDS;
    this.fight.addLog('Vashnik imbibes! The fountains activate!');
  }

  /** The fountains send out the minions, and the raid gets its Imbibe effects. */
  private spawnMinions(): void {
    this.phase = 'active';
    this.fight.addLog('Venom pours out of the fountains!');

    this.spawnGroup('shrouded', SHROUDED_VENOM_COUNT, SHADOW_FOUNTAIN, SHROUDED_SPAWN_SPREAD);
    this.spawnGroup('burning', BURNING_VENOM_COUNT, FIRE_FOUNTAIN, BURNING_SPAWN_SPREAD);

    // A Death Knight player does the death grip themselves; for everyone else it is automatic.
    this.gripTimer = this.playerClass === 'death-knight' ? null : GRIP_DELAY_SECONDS;

    // Stygian Infection follows a few seconds later (see runStygianInfection).
    this.stygianDelay = STYGIAN_INFECTION_DELAY_SECONDS;

    // A healer player also has to dispel everyone: the raid is hit with Exploding Infection.
    this.infectionTickTimer = EXPLODING_INFECTION_TICK_SECONDS;
    if (this.fight.player.role === 'healer') {
      this.explodingInfection = true;
      for (const raider of this.fight.raiders) this.fight.applyMagicDebuff(raider.id);
      this.fight.addLog('The whole raid is afflicted with Exploding Infection! Dispel it!');
    }
  }

  // --- Stygian Infection and Exploding Infection ---------------------------------------------------

  /**
   * Waits out the delay, then infects the player: they drop a purple circle under their feet once
   * per interval while the infection lasts.
   */
  private runStygianInfection(dtSeconds: number): void {
    if (this.stygianDelay !== null) {
      this.stygianDelay -= dtSeconds;
      if (this.stygianDelay > 0) return;
      this.stygianDelay = null;
      this.stygianStarted = true;
      this.infectionDropsLeft = Math.floor(
        STYGIAN_INFECTION_SECONDS / STYGIAN_DROP_INTERVAL_SECONDS,
      );
      this.infectionDropTimer = STYGIAN_DROP_INTERVAL_SECONDS;
      this.fight.addLog('You are infected with Stygian Infection!');
    }

    if (this.infectionDropsLeft <= 0 || !this.context) return;
    if (!this.fight.player.alive) {
      this.infectionDropsLeft = 0;
      return;
    }

    this.infectionDropTimer -= dtSeconds;
    while (this.infectionDropTimer <= 0 && this.infectionDropsLeft > 0) {
      this.infectionDropTimer += STYGIAN_DROP_INTERVAL_SECONDS;
      this.infectionDropsLeft--;
      this.zones.push({
        id: `infection-${this.infectionDropped++}`,
        pos: { ...this.context.playerPos },
        radius: ZONE_RADIUS,
        timeLeft: ZONE_DELAY_SECONDS,
      });
    }
  }

  /** Everyone who still has Exploding Infection takes damage on each tick. */
  private runExplodingInfectionDamage(dtSeconds: number): void {
    if (this.infectionTickTimer === null) return;
    this.infectionTickTimer -= dtSeconds;
    while (this.infectionTickTimer <= 0) {
      this.infectionTickTimer += EXPLODING_INFECTION_TICK_SECONDS;
      for (const raider of this.fight.raiders) {
        if (raider.alive && raider.debuffed)
          this.fight.damage(
            raider.id,
            EXPLODING_INFECTION_DAMAGE,
            'Exploding Infection was not dispelled.',
          );
      }
    }
  }

  /** Spawns minions in a loose spiral around a fountain so they start spread out, not stacked. */
  private spawnGroup(kind: MinionKind, count: number, centre: Vec2, spread: number): void {
    const turn = this.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const radius = spread * Math.sqrt((i + 0.5) / count);
      const angle = turn + i * 2.399963; // the golden angle, which spreads points evenly
      this.minions.push({
        id: `${kind}-${i}`,
        kind,
        pos: {
          x: Math.min(ARENA_WIDTH - 16, Math.max(16, centre.x + Math.cos(angle) * radius)),
          y: Math.min(ARENA_HEIGHT - 16, Math.max(16, centre.y + Math.sin(angle) * radius)),
        },
        progress: 0,
        alive: true,
        state: 'walking',
      });
    }
  }

  // --- Death grip and banish ------------------------------------------------------------------

  private runGripTimer(dtSeconds: number): void {
    if (this.gripTimer === null) return;
    this.gripTimer -= dtSeconds;
    if (this.gripTimer <= 0) {
      this.gripTimer = null;
      this.deathGrip(null);
    }
  }

  /**
   * Pulls two Burning Venom to whoever is gripping. `chosen` is the one the player clicked (the
   * second is random); with no `chosen`, the NPCs grip two random ones, one to each tank. The
   * Burning Venom left over is banished, unless a Warlock player will do that themselves.
   */
  private deathGrip(chosen: Minion | null): void {
    const candidates = this.minions.filter(
      (m) => m.alive && m.kind === 'burning' && m.state === 'walking',
    );
    this.gripDone = true;
    if (candidates.length === 0) return;

    const picks: Minion[] = [];
    if (chosen) picks.push(chosen);
    const others = this.shuffled(candidates.filter((m) => m !== chosen));
    while (picks.length < 2 && others.length > 0) picks.push(others.shift()!);

    const tanks = this.context?.tanks() ?? [];
    picks.forEach((minion, i) => {
      const source = chosen ? PLAYER_ID : tanks[i % Math.max(1, tanks.length)]?.id;
      if (!source) return; // no tank left to do the pulling; it just keeps walking
      minion.state = 'pulled';
      minion.pulledBy = source;
    });
    this.fight.addLog(
      chosen ? 'You death grip two Burning Venom!' : 'Two Burning Venom are death gripped!',
    );

    const third = candidates.find((m) => !picks.includes(m));
    this.thirdId = third?.id ?? null;
    if (third && this.playerClass !== 'warlock') {
      third.state = 'banished';
      this.fight.addLog('A Burning Venom is banished!');
    }
  }

  /** Where the one doing a death grip is, or undefined if they are gone. */
  private sourcePos(sourceId: string): Vec2 | undefined {
    if (!this.context) return undefined;
    return sourceId === PLAYER_ID ? this.context.playerPos : this.context.npcPos(sourceId);
  }

  // --- Moving the minions -------------------------------------------------------------------------

  private moveMinions(dtSeconds: number): void {
    for (const m of this.minions) {
      if (!m.alive) continue;

      if (m.state === 'banished' && this.fight.focusId === m.id) {
        m.state = 'walking'; // the player turned on it: the banish breaks
      }

      if (m.state === 'walking') {
        m.pos = moveToward(m.pos, POOL_TARGET, MINION_SPEED * dtSeconds);
      } else if (m.state === 'pulled') {
        this.pull(m, dtSeconds);
      }
    }
    this.keepApart();
  }

  /** Yanks a gripped minion to just beside whoever gripped it, then lets it walk on. */
  private pull(m: Minion, dtSeconds: number): void {
    const source = m.pulledBy ? this.sourcePos(m.pulledBy) : undefined;
    if (!source || !this.context) {
      m.state = 'walking';
      return;
    }
    const sourceRadius =
      m.pulledBy === PLAYER_ID ? this.context.playerRadius : this.context.npcRadius;
    const landing = towards(source, m.pos, sourceRadius + MINION_RADIUS + GRIP_LANDING_GAP);
    m.pos = moveToward(m.pos, landing, GRIP_SPEED * dtSeconds);
    if (distance(m.pos, landing) < 1) {
      m.state = 'walking';
      m.pulledBy = undefined;
    }
  }

  /** Nudges walking minions apart so they never stack into one icon. */
  private keepApart(): void {
    const walking = this.minions.filter((m) => m.alive && m.state !== 'pulled');
    for (let i = 0; i < walking.length; i++) {
      for (let j = i + 1; j < walking.length; j++) {
        const a = walking[i]!;
        const b = walking[j]!;
        const d = distance(a.pos, b.pos);
        if (d >= MINION_MIN_SEPARATION) continue;
        const nx = d > 1e-6 ? (b.pos.x - a.pos.x) / d : Math.cos(i + j);
        const ny = d > 1e-6 ? (b.pos.y - a.pos.y) / d : Math.sin(i + j);
        const push = (MINION_MIN_SEPARATION - d) / 2;
        // A banished minion does not get shoved around; its neighbour moves out of the way.
        const aFixed = a.state === 'banished';
        const bFixed = b.state === 'banished';
        const aShare = aFixed ? 0 : bFixed ? 2 : 1;
        const bShare = bFixed ? 0 : aFixed ? 2 : 1;
        a.pos = { x: a.pos.x - nx * push * aShare, y: a.pos.y - ny * push * aShare };
        b.pos = { x: b.pos.x + nx * push * bShare, y: b.pos.y + ny * push * bShare };
      }
    }
  }

  // --- Killing the minions ------------------------------------------------------------------------

  /**
   * A healer player has no way to attack, so the NPC DPS pick targets for them: the Shrouded
   * Venom first, then the Burning Venom, and the boss once the minions are gone. They stay on one
   * Burning Venom until it dies, and leave the banished one (which is no threat) for last.
   * DPS players choose their own targets by clicking, so this does nothing for them.
   */
  private autoFocusForHealer(): void {
    if (this.fight.player.role !== 'healer') return;

    const alive = this.minions.filter((m) => m.alive);
    const shrouded = alive.find((m) => m.kind === 'shrouded');
    const current = alive.find((m) => m.id === this.fight.focusId);

    let pick: Minion | undefined;
    if (shrouded) {
      pick = shrouded;
    } else if (current) {
      pick = current;
    } else {
      // The Burning Venom closest to the pool is the most urgent; a banished one can wait.
      const burning = alive
        .filter((m) => m.kind === 'burning')
        .sort((a, b) => {
          if ((a.state === 'banished') !== (b.state === 'banished')) {
            return a.state === 'banished' ? 1 : -1;
          }
          return distance(a.pos, POOL_TARGET) - distance(b.pos, POOL_TARGET);
        });
      pick = burning[0];
    }
    const wanted = pick?.id ?? BOSS_ID;
    if (this.fight.focusId !== wanted) this.fight.setFocus(wanted);
  }

  private applyDamage(dtSeconds: number): void {
    const target = this.minions.find((m) => m.alive && m.id === this.fight.focusId);
    if (!target || this.fight.status !== 'active') return;

    // The NPC DPS attack whatever the player has focused. A DPS player out of range of it cannot
    // join in, so they do not count, but the raid keeps attacking without them.
    const player = this.fight.player;
    const playerOutOfRange = isDps(player.role) && player.alive && !player.inRange;
    const dps = this.fight.aliveDpsCount - (playerOutOfRange ? 1 : 0);
    if (dps <= 0) return;
    if (target.kind === 'shrouded') {
      // The five Shrouded Venom share one pool of health.
      this.shroudedProgress += dtSeconds / Math.max(1, SHROUDED_KILL_BASE - dps);
      for (const m of this.minions) if (m.kind === 'shrouded') m.progress = this.shroudedProgress;
      if (this.shroudedProgress >= 1) this.killShrouded();
    } else {
      target.progress += dtSeconds / Math.max(1, BURNING_KILL_BASE - dps);
      if (target.progress >= 1) this.killBurning(target);
    }
  }

  private killShrouded(): void {
    for (const m of this.minions) {
      if (m.kind === 'shrouded' && m.alive) this.die(m);
    }
    this.fight.addLog('The Shrouded Venom burst! Shadow pools are forming!');
    this.spawnZones();
  }

  private killBurning(minion: Minion): void {
    this.die(minion);
    this.burningKilled++;
    this.fight.addLog(`A Burning Venom explodes for ${BURNING_DEATH_DAMAGE} damage to everyone!`);
    for (const raider of this.fight.raiders) {
      if (raider.alive) {
        this.fight.damage(raider.id, BURNING_DEATH_DAMAGE, 'Burning Venom explosions.');
      }
    }
  }

  private die(minion: Minion): void {
    minion.alive = false;
    this.events.push({
      type: 'minionDied',
      id: minion.id,
      kind: minion.kind,
      pos: { ...minion.pos },
    });
    if (this.fight.focusId === minion.id) this.fight.setFocus(BOSS_ID);
    this.minions = this.minions.filter((m) => m.alive);
  }

  // --- The purple circles -----------------------------------------------------------------------

  private spawnZones(): void {
    // Only in the lower two thirds of the arena.
    const top = ARENA_HEIGHT * ZONE_TOP_FRACTION + ZONE_RADIUS;
    for (let i = 0; i < ZONE_COUNT; i++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const pos = {
          x: ZONE_RADIUS + this.random() * (ARENA_WIDTH - ZONE_RADIUS * 2),
          y: top + this.random() * (ARENA_HEIGHT - ZONE_RADIUS - top),
        };
        // The whole circle has to stay out of the acid pool.
        if (distanceToPolygon(pos, POOL_POLYGON) < ZONE_RADIUS) continue;
        this.zones.push({
          id: `zone-${i}`,
          pos,
          radius: ZONE_RADIUS,
          timeLeft: ZONE_DELAY_SECONDS,
        });
        break;
      }
    }
  }

  private runZones(dtSeconds: number): void {
    const player = this.context?.playerPos;
    this.zones = this.zones.filter((zone) => {
      zone.timeLeft -= dtSeconds;
      if (zone.timeLeft > 0) return true;

      this.events.push({ type: 'zoneExploded', pos: { ...zone.pos }, radius: zone.radius });
      // Only the player is hurt; NPCs just try to stay out of the way.
      if (player && this.fight.player.alive && distance(player, zone.pos) <= zone.radius) {
        this.fight.addLog('You were caught in the shadow explosion!');
        this.fight.kill(PLAYER_ID, 'Caught in a shadow explosion.');
      }
      return false;
    });
  }

  // --- Catalytic Bile ----------------------------------------------------------------------------

  /** Runs the bile's schedule: wait, warn, show the circle, then check where the player is. */
  private runCatalyticBile(dtSeconds: number, context: EncounterContext): void {
    if (this.fight.status !== 'active') return;

    if (this.bileState === 'idle' || this.bileState === 'done') return;

    this.bileTimer -= dtSeconds;
    if (this.bileState === 'warning' && this.bileTimer <= 0) {
      this.bileState = 'out';
      this.bileTimer = CATALYTIC_BILE_DURATION_SECONDS;
      this.bile = {
        pos: this.pickBilePosition(context),
        radius: CATALYTIC_BILE_RADIUS,
        timeLeft: CATALYTIC_BILE_DURATION_SECONDS,
      };
      this.fight.addLog('Catalytic Bile pools on the floor!');
    } else if (this.bileState === 'out' && this.bile) {
      this.bile.timeLeft = Math.max(0, this.bileTimer);
      if (this.bileTimer <= 0) this.resolveBile(context);
    }
  }

  /** Starts the warning for a Catalytic Bile, unless one is already going. */
  private startBile(): void {
    if (this.bileState === 'warning' || this.bileState === 'out') return;
    this.bileState = 'warning';
    this.bileTimer = CATALYTIC_BILE_WARNING_SECONDS;
  }

  /**
   * Where the circle appears: anywhere in the lower two thirds of the arena that is clear of the
   * acid pool and, as far as possible, of NPC raiders. If no spot is completely clear, the one
   * with the most room around it is used.
   */
  private pickBilePosition(context: EncounterContext): Vec2 {
    const radius = CATALYTIC_BILE_RADIUS;
    const top = ARENA_HEIGHT * CATALYTIC_BILE_TOP_FRACTION + radius;
    const npcs = this.fight.npcs
      .map((c) => (c.alive ? context.npcPos(c.id) : undefined))
      .filter((p): p is Vec2 => p !== undefined);
    const needed = radius + context.npcRadius + CATALYTIC_BILE_NPC_CLEARANCE;

    let best: Vec2 | null = null;
    let bestRoom = -Infinity;
    for (let attempt = 0; attempt < 80; attempt++) {
      const pos = {
        x: radius + this.random() * (ARENA_WIDTH - radius * 2),
        y: top + this.random() * (ARENA_HEIGHT - radius - top),
      };
      if (distanceToPolygon(pos, POOL_POLYGON) < radius) continue; // the whole circle stays out of the pool
      // ...and inside the lines from the fountains to the pool.
      if (!pointInPolygon(pos, BILE_AREA)) continue;
      if (distance(pos, closestPointOnPolygon(pos, BILE_AREA)) < radius) continue;

      const room = npcs.length === 0 ? Infinity : Math.min(...npcs.map((p) => distance(p, pos)));
      if (room >= needed) return pos;
      if (room > bestRoom) {
        best = pos;
        bestRoom = room;
      }
    }
    return best ?? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT * 0.75 };
  }

  /** The circle's time is up: the raid survives only if the player is standing in it. */
  private resolveBile(context: EncounterContext): void {
    const bile = this.bile!;
    this.events.push({
      type: 'bileEnded',
      pos: { ...bile.pos },
      radius: bile.radius,
      color: CATALYTIC_BILE_COLOR,
    });
    this.bile = null;
    this.bileState = 'done';

    const standingIn =
      this.fight.player.alive && distance(context.playerPos, bile.pos) <= bile.radius;
    if (standingIn) {
      this.fight.addLog('You stood in the Catalytic Bile and shielded the raid!');
      return;
    }
    this.fight.addLog('Nobody stood in the Catalytic Bile! The raid is wiped out!');
    for (const raider of this.fight.raiders) {
      this.fight.kill(raider.id, 'Did not stand in the Catalytic Bile.');
    }
  }

  // --- Malignant Totems -----------------------------------------------------------------------

  /** Puts the totems at random spots in the lower two thirds of the arena, clear of the pool. */
  private spawnTotems(context: EncounterContext): void {
    const radius = context.npcRadius * MALIGNANT_TOTEM_SIZE_FACTOR;
    const top = ARENA_HEIGHT * MALIGNANT_TOTEM_TOP_FRACTION + radius;
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < MALIGNANT_TOTEM_COUNT; attempt++) {
      const pos = {
        x: radius + this.random() * (ARENA_WIDTH - radius * 2),
        y: top + this.random() * (ARENA_HEIGHT - radius - top),
      };
      if (distanceToPolygon(pos, POOL_POLYGON) < radius) continue;
      if (this.onFountain(pos, radius)) continue;
      const gap = radius * 2 + MALIGNANT_TOTEM_SPACING;
      if (this.totems.some((t) => distance(t.pos, pos) < gap)) continue;
      this.totems.push({ id: `totem-${this.totemsSpawned++}`, pos, radius });
      placed++;
    }
  }

  /** Whether a circle at `pos` touches one of the fountains in the bottom corners. */
  private onFountain(pos: Vec2, radius: number): boolean {
    return FOUNTAIN_AREAS.some((area) => {
      const nearestX = Math.min(area.x + area.width, Math.max(area.x, pos.x));
      const nearestY = Math.min(area.y + area.height, Math.max(area.y, pos.y));
      return Math.hypot(pos.x - nearestX, pos.y - nearestY) < radius;
    });
  }

  /** Removes every totem and puts down a new pair, TOTEM_RESET_DISTANCE apart. */
  private resetTotems(context: EncounterContext): void {
    this.totems = [];
    const radius = context.npcRadius * MALIGNANT_TOTEM_SIZE_FACTOR;
    const top = ARENA_HEIGHT * MALIGNANT_TOTEM_TOP_FRACTION + radius;
    const fits = (p: Vec2): boolean =>
      p.x >= radius &&
      p.x <= ARENA_WIDTH - radius &&
      p.y >= top &&
      p.y <= ARENA_HEIGHT - radius &&
      distanceToPolygon(p, POOL_POLYGON) >= radius &&
      !this.onFountain(p, radius);

    for (let attempt = 0; attempt < 400 && this.totems.length < TOTEM_RESET_COUNT; attempt++) {
      const first = this.totems[0];
      let pos: Vec2;
      if (!first) {
        pos = {
          x: radius + this.random() * (ARENA_WIDTH - radius * 2),
          y: top + this.random() * (ARENA_HEIGHT - radius - top),
        };
      } else {
        const angle = this.random() * Math.PI * 2;
        pos = {
          x: first.pos.x + Math.cos(angle) * TOTEM_RESET_DISTANCE,
          y: first.pos.y + Math.sin(angle) * TOTEM_RESET_DISTANCE,
        };
      }
      if (!fits(pos)) {
        // A first totem with no room for the second beside it is thrown away and tried again.
        if (first && attempt % 40 === 39) this.totems = [];
        continue;
      }
      this.totems.push({ id: `totem-${this.totemsSpawned++}`, pos, radius });
    }
  }

  // --- Plague Froth -----------------------------------------------------------------------------

  private runPlagueFroth(dtSeconds: number, context: EncounterContext): void {
    if (this.fight.status !== 'active') return;

    if (this.frothState === 'marked') {
      // Drop anyone who died, and keep the lines on whoever is left.
      this.frothTargets = this.frothTargets.filter((t) => {
        const pos = this.positionOf(t.id, context);
        if (pos) t.pos = pos;
        return pos !== undefined;
      });
      for (const target of this.frothTargets) target.timeLeft -= dtSeconds;
      if (this.frothTargets.length === 0) this.frothState = 'done';
      else if (this.frothTargets.some((t) => t.timeLeft <= 0)) this.fireFroth(context);
    }

    this.moveFrothBalls(dtSeconds, context);
  }

  /** Marks the player and four random non-tank NPCs. */
  private startPlagueFroth(context: EncounterContext): void {
    if (this.frothState === 'marked') return;
    this.frothState = 'marked';
    this.frothCasts++;
    this.frothMode =
      this.frothCasts === 1 ? 'aim' : this.frothCasts % 2 === 0 ? 'markers' : 'totems';
    this.frothTargets = [];
    this.frothAssign.clear();
    this.frothEmpty = [];
    const candidates = this.shuffled(
      this.fight.npcs.filter((c) => c.alive && c.role !== 'tank').map((c) => c.id),
    );
    const ids = this.fight.player.alive ? [PLAYER_ID] : [];
    while (ids.length < PLAGUE_FROTH_TARGET_COUNT && candidates.length > 0) {
      ids.push(candidates.shift()!);
    }
    for (const id of ids) {
      const pos = this.positionOf(id, context);
      if (pos) {
        this.frothTargets.push({
          id,
          pos: { ...pos },
          iconRadius: id === PLAYER_ID ? context.playerRadius : context.npcRadius,
          timeLeft: PLAGUE_FROTH_DELAY_SECONDS,
        });
      }
    }
    if (this.frothMode === 'markers') {
      // Every marked NPC picks a marker of its own, at random. The player takes one that is left.
      const free = this.shuffled(MARKERS.map((_, i) => i));
      for (const target of this.frothTargets) {
        if (target.id !== PLAYER_ID) this.frothAssign.set(target.id, free.shift()!);
      }
      this.frothEmpty = free;
    }
    this.fight.addLog('Plague Froth festers on the raid!');
  }

  /** Shoots a circle out along each line of every marked raider. */
  private fireFroth(context: EncounterContext): void {
    this.frothState = 'done';

    // With the markers, the player has to be on one nobody else is standing on.
    if (this.frothMode === 'markers' && this.fight.player.alive) {
      const onEmpty = this.frothEmpty.some(
        (i) => distance(context.playerPos, MARKERS[i]!.pos) <= MARKER_STAND_RADIUS,
      );
      if (!onEmpty) {
        this.fight.addLog('You did not stand on an empty marker!');
        this.fight.kill(PLAYER_ID, MARKER_WIPE_REASON);
      }
    }

    for (const target of this.frothTargets) {
      const radius = context.npcRadius;
      for (const dir of FROTH_DIRECTIONS) {
        this.frothBalls.push({
          // The circles start a few meters away from the raider, so anyone standing on them is safe.
          pos: {
            x: target.pos.x + dir.x * PLAGUE_FROTH_START_DISTANCE,
            y: target.pos.y + dir.y * PLAGUE_FROTH_START_DISTANCE,
          },
          velocity: { x: dir.x * PLAGUE_FROTH_SPEED, y: dir.y * PLAGUE_FROTH_SPEED },
          radius,
          sourceId: target.id,
        });
      }
    }
    this.frothTargets = [];
  }

  /**
   * Moves the circles on, until they are off the arena. A circle kills the player (unless they
   * shot it) and destroys any totem it touches. NPCs are never hurt by them.
   */
  private moveFrothBalls(dtSeconds: number, context: EncounterContext): void {
    this.frothBalls = this.frothBalls.filter((ball) => {
      ball.pos = {
        x: ball.pos.x + ball.velocity.x * dtSeconds,
        y: ball.pos.y + ball.velocity.y * dtSeconds,
      };
      const r = ball.radius;
      if (ball.pos.x < -r || ball.pos.x > ARENA_WIDTH + r) return false;
      if (ball.pos.y < -r || ball.pos.y > ARENA_HEIGHT + r) return false;

      if (
        ball.sourceId !== PLAYER_ID &&
        this.fight.player.alive &&
        distance(ball.pos, context.playerPos) < r + context.playerRadius
      ) {
        this.fight.addLog('You were hit by Plague Froth!');
        this.fight.kill(PLAYER_ID, 'Hit by a plague wave.');
      }
      // A circle destroys any totem it touches.
      this.totems = this.totems.filter((t) => distance(ball.pos, t.pos) >= r + t.radius);
      return true;
    });
  }

  private positionOf(id: string, context: EncounterContext): Vec2 | undefined {
    if (id === PLAYER_ID) return this.fight.player.alive ? context.playerPos : undefined;
    const npc = this.fight.npcs.find((c) => c.id === id);
    return npc?.alive ? context.npcPos(id) : undefined;
  }

  /** Pushes a marked NPC's goal away from every other living raider. */
  private spreadOut(npc: NpcInfo, goal: Vec2): Vec2 {
    const context = this.context;
    if (!context) return goal;
    const others: Vec2[] = [];
    if (this.fight.player.alive) others.push(context.playerPos);
    for (const c of this.fight.npcs) {
      const pos = c.alive && c.id !== npc.id ? context.npcPos(c.id) : undefined;
      if (pos) others.push(pos);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const other of others) {
        goal = pushOutOfCircle(goal, other, PLAGUE_FROTH_SPREAD_DISTANCE);
      }
    }
    return goal;
  }

  /** Whether the marked NPCs are standing on their markers (and everyone else stacking on the tanks). */
  private holdingMarkers(): boolean {
    return (
      this.frothMode === 'markers' &&
      this.frothCasts > 0 &&
      (this.frothState === 'marked' || this.frothBalls.length > 0)
    );
  }

  /** Whether a raider standing at `origin` would shoot a circle into a totem. */
  private wavesHitTotem(origin: Vec2, radius: number): boolean {
    for (const dir of FROTH_DIRECTIONS) {
      const start = {
        x: origin.x + dir.x * PLAGUE_FROTH_START_DISTANCE,
        y: origin.y + dir.y * PLAGUE_FROTH_START_DISTANCE,
      };
      for (const totem of this.totems) {
        const reach = totem.radius + radius;
        const dx = totem.pos.x - start.x;
        const dy = totem.pos.y - start.y;
        const along = dx * dir.x + dy * dir.y;
        const across = Math.abs(dx * dir.y - dy * dir.x);
        if (along >= 0 ? across < reach : Math.hypot(dx, dy) < reach) return true;
      }
    }
    return false;
  }

  /** Moves a marked NPC's goal to the nearest spot from which its circles miss every totem. */
  private avoidTotemLines(goal: Vec2, half: number): Vec2 {
    if (this.totems.length === 0 || !this.wavesHitTotem(goal, half)) return goal;
    for (let ring = 1; ring <= 16; ring++) {
      for (let k = 0; k < 12; k++) {
        const angle = (k / 12) * Math.PI * 2;
        const spot = clampToArea(
          { x: goal.x + Math.cos(angle) * ring * 20, y: goal.y + Math.sin(angle) * ring * 20 },
          ARENA_WIDTH,
          ARENA_HEIGHT,
          half,
        );
        if (distanceToPolygon(spot, POOL_POLYGON) < half + POOL_AVOID_MARGIN) continue;
        if (!this.wavesHitTotem(spot, half)) return spot;
      }
    }
    return goal;
  }

  /** Steps a goal out of the way of the player's plague waves (the lines before they fire, then the circles). */
  private dodgePlayerWaves(goal: Vec2, half: number): Vec2 {
    const clearance = (this.context?.npcRadius ?? half) + half + 6;
    const player = this.frothTargets.find((t) => t.id === PLAYER_ID);
    if (player) {
      for (const dir of FROTH_DIRECTIONS) {
        const origin = {
          x: player.pos.x + dir.x * PLAGUE_FROTH_START_DISTANCE,
          y: player.pos.y + dir.y * PLAGUE_FROTH_START_DISTANCE,
        };
        goal = this.avoidRay(goal, origin, dir, clearance);
      }
    }
    for (const ball of this.frothBalls) {
      if (ball.sourceId !== PLAYER_ID) continue;
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y) || 1;
      const dir = { x: ball.velocity.x / speed, y: ball.velocity.y / speed };
      goal = this.avoidRay(goal, ball.pos, dir, clearance);
    }
    return goal;
  }

  /** Pushes a point sideways out of the path of something travelling from `origin` along `dir`. */
  private avoidRay(point: Vec2, origin: Vec2, dir: Vec2, clearance: number): Vec2 {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (dx * dir.x + dy * dir.y < 0) return pushOutOfCircle(point, origin, clearance); // behind it
    const side = dx * dir.y - dy * dir.x;
    if (Math.abs(side) >= clearance) return point;
    const sign = side >= 0 ? 1 : -1;
    const push = clearance - Math.abs(side);
    return { x: point.x + sign * dir.y * push, y: point.y - sign * dir.x * push };
  }

  // --- The pool ---------------------------------------------------------------------------------

  /** Anyone whose icon centre is in the acid pool dies at once. */
  private killRaidersInPool(context: EncounterContext): void {
    if (this.fight.status !== 'active') return;
    if (this.fight.player.alive && pointInPolygon(context.playerPos, POOL_POLYGON)) {
      this.fight.addLog('You fell into the acid pool!');
      this.fight.kill(PLAYER_ID, 'Fell into the acid pool.');
    }
    for (const npc of this.fight.npcs) {
      const pos = npc.alive ? context.npcPos(npc.id) : undefined;
      if (pos && pointInPolygon(pos, POOL_POLYGON)) {
        this.fight.kill(npc.id, 'A raider fell into the acid pool.');
      }
    }
  }

  /** A minion in the pool kills the whole raid. */
  private checkPoolBreach(): void {
    if (this.poolBreached || this.fight.status !== 'active') return;
    if (!this.minions.some((m) => m.alive && pointInPolygon(m.pos, POOL_POLYGON))) return;

    this.poolBreached = true;
    this.fight.addLog('A venom reached the acid pool! The raid is wiped out!');
    for (const raider of this.fight.raiders) {
      this.fight.kill(raider.id, 'A venom reached the acid pool.');
    }
  }

  // --- Prompts ----------------------------------------------------------------------------------

  /**
   * Builds the instruction at the top of the screen from everything that applies right now. If
   * several do at once (say, a Death Knight's grip and Stygian Infection), they stack, one per line.
   */
  private updatePrompt(): void {
    const lines: string[] = [];
    const player = this.fight.player;
    const burning = this.minions.filter((m) => m.alive && m.kind === 'burning');
    const third = burning.find((m) => m.id === this.thirdId);

    // While Vashnik imbibes, before the minions are out. A healer's raid picks targets itself.
    if (this.phase === 'imbibing' && player.role !== 'healer') lines.push(FOCUS_PROMPT);

    if (this.playerClass === 'death-knight' && !this.gripDone && burning.length > 0) {
      lines.push(DEATH_GRIP_PROMPT);
    }
    if (
      this.playerClass === 'warlock' &&
      this.gripDone &&
      this.burningKilled < BURNING_KILLS_FOR_BILE &&
      third &&
      third.state !== 'banished'
    ) {
      lines.push(BANISH_PROMPT);
    }
    if (
      this.explodingInfection &&
      player.alive &&
      this.fight.raiders.some((r) => r.alive && r.debuffed)
    ) {
      lines.push(DISPEL_PROMPT);
    }

    // Plague Froth: from when the lines show until the circles are gone (with the markers, until
    // they shoot out, when it is settled whether the player is on one).
    const frothOn = this.frothState === 'marked' || this.frothBalls.length > 0;
    if (this.frothMode === 'aim' && frothOn) lines.push(FROTH_AIM_PROMPT);
    if (this.frothMode === 'markers' && this.frothState === 'marked') {
      lines.push(FROTH_MARKER_PROMPT);
    }
    if (this.frothMode === 'totems' && frothOn) lines.push(FROTH_TOTEM_PROMPT);

    // From two seconds before the green circle appears until its time is up.
    if (this.bileState === 'warning' || this.bileState === 'out') {
      lines.push(CATALYTIC_BILE_PROMPT);
    }

    // From when Stygian Infection goes out until its last circle has exploded.
    const circlesLeft = this.zones.some((z) => z.id.startsWith('infection-'));
    if (this.stygianStarted && player.alive && (this.infectionDropsLeft > 0 || circlesLeft)) {
      lines.push(STYGIAN_PROMPT);
    }

    this.prompt = lines.length > 0 ? lines.join('\n') : null;
  }

  private shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }
}
