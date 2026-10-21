import Phaser from 'phaser';
import { markerKey } from '../assets/manifest';
import type { Vec2 } from '../game/movement';
import type { PlayerChoice } from '../game/player';
import { npcRoles, playerRaidRole } from '../raid/composition';
import { RaidGroup } from '../raid/RaidGroup';
import { AttackEffects } from '../ui/attackEffects';
import { CombatLog, type LogArea } from '../ui/combatLog';
import { CountdownView } from '../ui/countdownView';
import { showVictoryScreen, showWipeScreen } from '../ui/endScreen';
import { createPlayerToken } from '../ui/playerToken';
import { PromptBanner } from '../ui/promptBanner';
import { TokenView } from '../ui/tokenView';
import { attackStyleFor } from './attackStyles';
import { BossMovement } from './bossMovement';
import {
  BOSS_RELOCATE_SPEED,
  BOSS_RUN_SPEED,
  COUNTDOWN_FROM,
  COUNTDOWN_SECONDS_PER_NUMBER,
  HEALTH_RING_COLOR,
  HUDDLE_SPACING,
  LOW_HEALTH_THRESHOLD,
  PLAYER_RING_SHOWS_HEALTH,
  TANK_CONTACT_DISTANCE,
} from './config';
import { countdownNumber } from './countdown';
import { installDebugShortcuts } from './debugShortcuts';
import type { Encounter, EncounterContext, FocusTarget } from './encounter';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';
import { clumpPositions } from './formation';
import { isInRange, rangeMetersFor } from './ranges';

export interface FightRuntimeOptions {
  choice: PlayerChoice;
  /** Size of the play area. The wipe screen covers exactly this. */
  arena: { width: number; height: number };
  boss: {
    /** Where the boss stands when the fight begins. */
    start: Vec2;
    /**
     * Where the tanks take the boss once they reach it. Leave out for a boss that stays where it
     * starts. The boss runs at the tanks first, then is moved here.
     */
    destination?: Vec2;
    /** Diameter of the boss icon. */
    size: number;
    textureKey: string;
    /** Defaults to BOSS_MAX_HEALTH. */
    maxHealth?: number;
  };
  /** The middle of the huddle the whole raid starts in. Defaults to the bottom centre. */
  raidStart?: Vec2;
  /** Diameters of the player and NPC icons. */
  playerSize: number;
  npcSize: number;
  logArea: LogArea;
  /** The end screens' buttons: start the fight again, or leave for the boss menu. */
  onRetry: () => void;
  onExit: () => void;
  random?: () => number;
}

/**
 * Everything a boss fight shares, so each boss scene only adds its own art and mechanics: the
 * rules (`Fight`), the player, boss and NPC icons, the huddle and the 3-2-1 countdown, the boss
 * running at the tanks and being moved into place, clicking to heal, dispel and focus, the fight
 * log, and the end screens. A boss's own mechanics plug in as an `Encounter`.
 *
 * Create it in `create()` and call `update()` every frame.
 */
export class FightRuntime {
  readonly fight: Fight;
  /** Where the player starts, in the huddle. Put the player's icon here. */
  readonly playerStart: Vec2;

  private readonly scene: Phaser.Scene;
  private readonly arena: { width: number; height: number };
  private readonly playerToken: TokenView;
  private readonly bossToken: TokenView;
  private readonly raid: RaidGroup;
  private readonly log: CombatLog;
  private readonly effects: AttackEffects;
  private readonly countdown: CountdownView;
  private readonly prompt: PromptBanner;
  private readonly bossMovement: BossMovement;
  private readonly endActions: { onRetry: () => void; onExit: () => void };
  private readonly choice: PlayerChoice;
  /** Icon radii, for working out attack range and where attack animations start and end. */
  private readonly radii: { player: number; npc: number; boss: number };
  private encounter: Encounter | null = null;
  private playerPos: Vec2;
  private countdownElapsed = 0;
  private begun = false;

  constructor(scene: Phaser.Scene, options: FightRuntimeOptions) {
    const { choice, arena, boss } = options;
    this.scene = scene;
    this.arena = arena;
    this.endActions = { onRetry: options.onRetry, onExit: options.onExit };
    this.choice = choice;
    this.radii = {
      player: options.playerSize / 2,
      npc: options.npcSize / 2,
      boss: boss.size / 2,
    };
    this.bossMovement = new BossMovement({
      start: boss.start,
      destination: boss.destination,
      runSpeed: BOSS_RUN_SPEED,
      relocateSpeed: BOSS_RELOCATE_SPEED,
      contactDistance: TANK_CONTACT_DISTANCE,
    });

    this.fight = new Fight({
      playerRole: playerRaidRole(choice),
      npcRoles: npcRoles(choice),
      bossMaxHealth: boss.maxHealth,
      // Only a DPS player attacks; a healer's range is never used.
      playerRangeMeters:
        choice.role === 'dps' ? rangeMetersFor(choice.classId, choice.range ?? 'ranged') : 0,
      random: options.random,
    });

    // Everyone begins in a tight huddle (the player first, then the NPCs in order).
    const huddleCentre = options.raidStart ?? { x: arena.width / 2, y: arena.height - 60 };
    const huddle = clumpPositions(huddleCentre, 1 + this.fight.npcs.length, HUDDLE_SPACING).map(
      (p) => ({
        x: Math.min(arena.width - 20, Math.max(20, p.x)),
        y: Math.min(arena.height - 20, Math.max(20, p.y)),
      }),
    );
    this.playerStart = huddle[0]!;
    this.playerPos = { ...this.playerStart };

    // Created back to front: boss, then the NPCs, then the player on top.
    this.bossToken = new TokenView(scene, {
      x: boss.start.x,
      y: boss.start.y,
      size: boss.size,
      ringColor: HEALTH_RING_COLOR,
      art: { key: boss.textureKey, size: boss.size },
      crossKey: markerKey('cross'),
      removeAfterDeath: false,
    });
    this.raid = new RaidGroup(scene, {
      choice,
      fight: this.fight,
      boss: boss.start,
      bossRadius: boss.size / 2,
      npcSize: options.npcSize,
      arena,
      startPositions: huddle.slice(1),
      adjustTarget: (npc, target) => this.encounter?.adjustNpcTarget?.(npc, target) ?? target,
      random: options.random,
    });
    this.playerToken = createPlayerToken(
      scene,
      this.playerStart.x,
      this.playerStart.y,
      choice.classId,
      options.playerSize,
    );
    this.log = new CombatLog(scene, options.logArea);
    this.effects = new AttackEffects(scene);
    this.countdown = new CountdownView(scene, { x: arena.width / 2, y: arena.height / 2 });
    this.prompt = new PromptBanner(scene, arena.width);

    // Left-click heals (healer) and right-click dispels (healer); clicking the boss focuses it.
    this.playerToken.onClick((button) => this.click(PLAYER_ID, button));
    for (const npc of this.fight.npcs) {
      this.raid.tokenFor(npc.id)?.onClick((button) => this.click(npc.id, button));
    }
    this.bossToken.onClick((button) => {
      if (button === 'left') this.focusOn(BOSS_ID);
    });
    // Stop the browser's right-click menu popping up over the game.
    const stopMenu = (e: Event): void => e.preventDefault();
    scene.game.canvas.addEventListener('contextmenu', stopMenu);
    scene.events.once('shutdown', () =>
      scene.game.canvas.removeEventListener('contextmenu', stopMenu),
    );

    installDebugShortcuts(scene, this.fight);
  }

  /** Plugs in a boss's own mechanics. Call once, right after creating the runtime. */
  setEncounter(encounter: Encounter): void {
    this.encounter = encounter;
  }

  /** Whether the countdown is over and the fight has begun. */
  get started(): boolean {
    return this.begun;
  }

  /** Where the boss is right now. */
  get bossPos(): Vec2 {
    return this.bossMovement.position;
  }

  /** Whether the player can move and act: the fight has begun, they are alive, and it is on. */
  get playerCanAct(): boolean {
    return this.begun && this.fight.status === 'active' && this.fight.player.alive;
  }

  setPlayerPosition(x: number, y: number): void {
    this.playerPos = { x, y };
    this.playerToken.setPosition(x, y);
  }

  /** Shows an instruction at the top of the arena, or hides it with null. */
  setPrompt(message: string | null): void {
    this.prompt.set(message);
  }

  /** Where something is on the field right now: the player, an NPC, or the boss. */
  positionOf(id: string): Vec2 | undefined {
    if (id === PLAYER_ID) return this.playerPos;
    if (id === BOSS_ID) return this.bossPos;
    return this.raid.positionOf(id);
  }

  /**
   * Points the raid's DPS at the boss, or at something the encounter offers. Does nothing before
   * the fight begins or after the player has died. An encounter can also choose targets itself
   * (Vashnik does, for a healer player, who has no way to attack).
   */
  focusOn(id: string): void {
    if (!this.playerCanAct) return;
    if (id !== BOSS_ID && !this.encounter?.focusTargets().some((t) => t.id === id)) return;
    this.fight.setFocus(id);
  }

  /** Advance the fight by one frame. */
  update(dtSeconds: number): void {
    if (!this.begun) {
      this.runCountdown(dtSeconds);
    } else {
      this.runFight(dtSeconds);
    }

    this.bossToken.setPosition(this.bossPos.x, this.bossPos.y);
    this.playerToken.update(dtSeconds);
    this.bossToken.update(dtSeconds);
    this.effects.update(dtSeconds);
    this.raid.update(this.begun ? dtSeconds : 0, this.bossPos);
  }

  private runCountdown(dtSeconds: number): void {
    this.countdownElapsed += dtSeconds;
    const number = countdownNumber(
      this.countdownElapsed,
      COUNTDOWN_FROM,
      COUNTDOWN_SECONDS_PER_NUMBER,
    );
    if (number === null) {
      this.countdown.show(null, 0);
      this.begun = true;
      this.bossMovement.begin();
      return;
    }
    const progress =
      (this.countdownElapsed % COUNTDOWN_SECONDS_PER_NUMBER) / COUNTDOWN_SECONDS_PER_NUMBER;
    this.countdown.show(number, progress);
  }

  private runFight(dtSeconds: number): void {
    if (this.fight.status === 'active') {
      this.bossMovement.update(dtSeconds, this.tankInfo(), this.radii.boss);
      this.updateRanges();
      this.fight.update(dtSeconds);
      this.encounter?.update(dtSeconds, this.context());
    }

    for (const event of this.fight.drainEvents()) {
      switch (event.type) {
        case 'healed':
          this.tokenFor(event.id)?.flashHeal();
          break;
        case 'attacked':
          this.showAttack(event.id, event.targetId);
          break;
        case 'died':
          // The boss's own defeat is shown by the fight ending, not by darkening it.
          if (event.id !== BOSS_ID) this.tokenFor(event.id)?.die();
          break;
        case 'log':
          this.log.add(event.text);
          break;
        case 'wiped':
          showWipeScreen(this.scene, this.arena, event.message, event.detail, this.endActions);
          break;
        case 'won':
          showVictoryScreen(this.scene, this.arena, this.endActions);
          break;
        default:
          break;
      }
    }

    this.syncTokens();
  }

  private context(): EncounterContext {
    return {
      fight: this.fight,
      bossPos: this.bossPos,
      bossInPosition: this.bossMovement.inPosition,
      playerPos: this.playerPos,
      playerRadius: this.radii.player,
      npcRadius: this.radii.npc,
      npcPos: (id) => this.raid.positionOf(id),
      moveBoss: (destination) => this.bossMovement.moveTo(destination),
      tanks: () =>
        this.fight.npcs
          .filter((c) => c.role === 'tank' && c.alive)
          .flatMap((c) => {
            const pos = this.raid.positionOf(c.id);
            return pos ? [{ id: c.id, pos }] : [];
          }),
    };
  }

  /** The living tanks, for the boss to run at and be led by. */
  private tankInfo(): { pos: Vec2; radius: number }[] {
    return this.context()
      .tanks()
      .map((t) => ({ pos: t.pos, radius: this.radii.npc }));
  }

  /** What the DPS are attacking right now: where it is and how big it is. */
  private focusTarget(): FocusTarget {
    const other = this.encounter?.focusTargets().find((t) => t.id === this.fight.focusId);
    if (other) return other;
    // The focus is gone (or it was the boss): fall back to the boss.
    if (this.fight.focusId !== BOSS_ID) this.fight.setFocus(BOSS_ID);
    return { id: BOSS_ID, pos: this.bossPos, radius: this.radii.boss };
  }

  private click(id: string, button: 'left' | 'right'): void {
    if (!this.begun) return;
    if (button === 'left') this.fight.tryPlayerHeal(id);
    else this.fight.tryPlayerDispel(id);
  }

  private tokenFor(id: string): TokenView | undefined {
    if (id === PLAYER_ID) return this.playerToken;
    if (id === BOSS_ID) return this.bossToken;
    return this.raid.tokenFor(id);
  }

  /** Tells the fight which DPS are currently close enough to what they are attacking. */
  private updateRanges(): void {
    const target = this.focusTarget();
    for (const c of this.fight.raiders) {
      if (c.role !== 'melee' && c.role !== 'ranged') continue;
      const pos = this.positionOf(c.id);
      if (!pos || !c.alive) continue;
      const radius = c.kind === 'player' ? this.radii.player : this.radii.npc;
      this.fight.setInRange(c.id, isInRange(pos, radius, target.pos, target.radius, c.rangeMeters));
    }
  }

  /** Plays the attack animation for a DPS: a swipe, stab, projectile or beam at its target. */
  private showAttack(id: string, targetId: string): void {
    const c = this.fight.get(id);
    const token = this.tokenFor(id);
    if (!token || !c.role) return;
    const classId = c.kind === 'player' ? this.choice.classId : undefined;
    const radius = c.kind === 'player' ? this.radii.player : this.radii.npc;

    // The target may vanish while the animation plays; remember where it last was.
    let last: Vec2 = this.focusTarget().pos;
    const targetRadius = targetId === BOSS_ID ? this.radii.boss : this.targetRadius(targetId);
    const where = (): Vec2 => {
      const found =
        targetId === BOSS_ID
          ? this.bossPos
          : this.encounter?.focusTargets().find((t) => t.id === targetId)?.pos;
      if (found) last = found;
      return last;
    };
    this.effects.spawn(
      attackStyleFor(c.role, classId),
      () => token.position,
      radius,
      where,
      targetRadius,
    );
  }

  private targetRadius(targetId: string): number {
    return this.encounter?.focusTargets().find((t) => t.id === targetId)?.radius ?? this.radii.boss;
  }

  /** Copies each combatant's health, debuff and enrage state onto its icon. */
  private syncTokens(): void {
    for (const c of this.fight.combatants) {
      const token = this.tokenFor(c.id);
      if (!token) continue;

      const showsHealth = c.kind !== 'player' || PLAYER_RING_SHOWS_HEALTH;
      token.setHealthFraction(showsHealth ? c.health / c.maxHealth : 1);
      token.setLowHealth(c.kind !== 'boss' && c.alive && c.health <= LOW_HEALTH_THRESHOLD);
      token.setDebuffed(c.debuffed);
      if (c.kind === 'boss') {
        token.setEnraged(this.fight.enraged && c.alive);
        // Only mark the boss as the target when there is something else it could have been.
        const choices = this.encounter?.focusTargets().length ?? 0;
        token.setFocused(choices > 0 && this.fight.focusId === BOSS_ID);
      }
    }
  }
}
