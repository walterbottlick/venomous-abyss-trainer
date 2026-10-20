import { ROLE_LABEL, type RaidRole } from '../raid/types';
import {
  BOSS_MAX_HEALTH,
  ENRAGE_WIPE_DELAY_SECONDS,
  HEAL_AMOUNT,
  HEALER_COOLDOWN_SECONDS,
  MAX_HEALTH,
  LOW_HEALTH_THRESHOLD,
  NPC_HEAL_PRIORITY,
} from './config';
import { pickWipeMessage, WIPE_PRIORITY, type WipeReason } from './wipeMessages';

/**
 * The rules of a fight, with no graphics: who is alive, health, healing, dispelling, death, enrage
 * and when the raid wipes. The scene reads this every frame to draw it, and reacts to the events
 * it produces (see `drainEvents`). Keeping it free of Phaser makes it easy to test.
 */

export const PLAYER_ID = 'player';
export const BOSS_ID = 'boss';
export const npcId = (index: number): string => `npc-${index}`;

export type CombatantKind = 'player' | 'npc' | 'boss';

export interface Combatant {
  id: string;
  kind: CombatantKind;
  /** The raid role. Null for the boss. */
  role: RaidRole | null;
  maxHealth: number;
  health: number;
  alive: boolean;
  /** Hit by a magic effect that a healer can dispel. */
  debuffed: boolean;
}

/** One-off things that happened, for the scene to react to (flash an icon, add a log line...). */
export type FightEvent =
  | { type: 'healed'; id: string }
  | { type: 'died'; id: string }
  | { type: 'log'; text: string }
  | { type: 'enraged' }
  | { type: 'won' }
  | { type: 'wiped'; reason: WipeReason; message: string };

export type FightStatus = 'active' | 'won' | 'wiped';

export interface FightOptions {
  /** The raid role the player fills. */
  playerRole: RaidRole;
  /** One entry per NPC, in the order their ids (`npcId(0)`, `npcId(1)`...) are handed out. */
  npcRoles: readonly RaidRole[];
  bossMaxHealth?: number;
  /** Random numbers in [0, 1). Defaults to Math.random; pass a seeded one in tests. */
  random?: () => number;
}

export class Fight {
  readonly combatants: Combatant[] = [];
  status: FightStatus = 'active';
  /** Set once the fight is wiped. */
  wipe: { reason: WipeReason; message: string } | null = null;
  enraged = false;
  /** Seconds until an enraged boss wipes the raid, if it is not killed first. */
  enrageRemaining = 0;

  private readonly byId = new Map<string, Combatant>();
  private readonly nextActionAt = new Map<string, number>();
  private events: FightEvent[] = [];
  private time = 0;
  private readonly random: () => number;

  constructor(options: FightOptions) {
    this.random = options.random ?? Math.random;

    this.add({ id: PLAYER_ID, kind: 'player', role: options.playerRole });
    options.npcRoles.forEach((role, i) => this.add({ id: npcId(i), kind: 'npc', role }));
    this.add({
      id: BOSS_ID,
      kind: 'boss',
      role: null,
      maxHealth: options.bossMaxHealth ?? BOSS_MAX_HEALTH,
    });

    // Stagger the NPC healers so they don't all cast on the same frame.
    for (const c of this.combatants) {
      if (c.kind === 'npc' && c.role === 'healer') {
        this.nextActionAt.set(c.id, this.random() * HEALER_COOLDOWN_SECONDS);
      }
    }
  }

  private add(c: {
    id: string;
    kind: CombatantKind;
    role: RaidRole | null;
    maxHealth?: number;
  }): void {
    const maxHealth = c.maxHealth ?? (c.role ? MAX_HEALTH[c.role] : BOSS_MAX_HEALTH);
    const combatant: Combatant = {
      id: c.id,
      kind: c.kind,
      role: c.role,
      maxHealth,
      health: maxHealth,
      alive: true,
      debuffed: false,
    };
    this.combatants.push(combatant);
    this.byId.set(c.id, combatant);
  }

  // --- Lookups ---------------------------------------------------------------------------------

  get(id: string): Combatant {
    const c = this.byId.get(id);
    if (!c) throw new Error(`Unknown combatant "${id}"`);
    return c;
  }

  get player(): Combatant {
    return this.get(PLAYER_ID);
  }

  get boss(): Combatant {
    return this.get(BOSS_ID);
  }

  /** The player and every NPC (everyone but the boss). */
  get raiders(): Combatant[] {
    return this.combatants.filter((c) => c.kind !== 'boss');
  }

  get npcs(): Combatant[] {
    return this.combatants.filter((c) => c.kind === 'npc');
  }

  /** Events since the last call, oldest first. The scene calls this once per frame. */
  drainEvents(): FightEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // --- Changing health -------------------------------------------------------------------------

  /** Sets health directly (clamped to 0..max). Reaching 0 kills the combatant. */
  setHealth(id: string, health: number): void {
    const c = this.get(id);
    if (this.status !== 'active' || !c.alive) return;
    c.health = Math.min(c.maxHealth, Math.max(0, health));
    if (c.health === 0) this.die(c);
  }

  damage(id: string, amount: number): void {
    this.setHealth(id, this.get(id).health - amount);
  }

  /** Adds health, never above the maximum. Returns how much was actually restored. */
  heal(id: string, amount: number = HEAL_AMOUNT): number {
    const c = this.get(id);
    if (this.status !== 'active' || !c.alive || c.health >= c.maxHealth) return 0;
    const gained = Math.min(amount, c.maxHealth - c.health);
    c.health += gained;
    this.events.push({ type: 'healed', id });
    return gained;
  }

  kill(id: string): void {
    const c = this.get(id);
    if (this.status !== 'active' || !c.alive) return;
    this.die(c);
  }

  private die(c: Combatant): void {
    c.alive = false;
    c.health = 0;
    c.debuffed = false;
    this.events.push({ type: 'died', id: c.id });
    if (c.kind === 'npc' && c.role) {
      this.log(`${ROLE_LABEL[c.role]} has died!`);
    } else if (c.kind === 'player') {
      this.log('You have died!');
    }
  }

  // --- Healing and dispelling ------------------------------------------------------------------

  /**
   * A healer heals a raider for HEAL_AMOUNT. Does nothing (and starts no cooldown) unless the
   * healer is alive and off cooldown and the target is alive and hurt. Returns whether it healed.
   */
  tryHeal(healerId: string, targetId: string): boolean {
    const healer = this.get(healerId);
    const target = this.get(targetId);
    if (this.status !== 'active' || !healer.alive || healer.role !== 'healer') return false;
    if (target.kind === 'boss' || !target.alive || target.health >= target.maxHealth) return false;
    if (!this.isReady(healerId)) return false;

    this.heal(targetId, HEAL_AMOUNT);
    this.startCooldown(healerId);
    return true;
  }

  /**
   * A healer dispels a raider's magic effect. Like a heal, it does nothing (and starts no
   * cooldown) unless the healer is alive and off cooldown and the target is alive and has an
   * effect to remove. Heals and dispels share one cooldown. Returns whether it dispelled.
   */
  tryDispel(healerId: string, targetId: string): boolean {
    const healer = this.get(healerId);
    const target = this.get(targetId);
    if (this.status !== 'active' || !healer.alive || healer.role !== 'healer') return false;
    if (target.kind === 'boss' || !target.alive || !target.debuffed) return false;
    if (!this.isReady(healerId)) return false;

    this.dispel(targetId);
    this.startCooldown(healerId);
    return true;
  }

  /** Whether this healer is off cooldown and free to use an ability. */
  private isReady(healerId: string): boolean {
    return this.time >= (this.nextActionAt.get(healerId) ?? 0);
  }

  private startCooldown(healerId: string): void {
    this.nextActionAt.set(healerId, this.time + HEALER_COOLDOWN_SECONDS);
  }

  /** The player (if a healer) heals a raider. */
  tryPlayerHeal(targetId: string): boolean {
    return this.tryHeal(PLAYER_ID, targetId);
  }

  /** Marks a raider as hit by a magic effect that needs dispelling. */
  applyMagicDebuff(id: string): void {
    const c = this.get(id);
    if (this.status === 'active' && c.alive && c.kind !== 'boss') c.debuffed = true;
  }

  /** Removes the debuff from a raider immediately. Returns whether there was one to remove. */
  dispel(id: string): boolean {
    const c = this.get(id);
    if (!c.debuffed) return false;
    c.debuffed = false;
    return true;
  }

  /** The player (if a healer) dispels a raider. Only healers can dispel. */
  tryPlayerDispel(targetId: string): boolean {
    return this.tryDispel(PLAYER_ID, targetId);
  }

  // --- The boss --------------------------------------------------------------------------------

  /** Starts the enrage countdown. Kill the boss within ENRAGE_WIPE_DELAY_SECONDS or wipe. */
  enrageBoss(): void {
    if (this.status !== 'active' || !this.boss.alive || this.enraged) return;
    this.enraged = true;
    this.enrageRemaining = ENRAGE_WIPE_DELAY_SECONDS;
    this.events.push({ type: 'enraged' });
    this.log('The boss has become enraged!');
  }

  // --- Time ------------------------------------------------------------------------------------

  /** Advance the fight by `dtSeconds`: NPC healing, the enrage countdown, then win/wipe checks. */
  update(dtSeconds: number): void {
    if (this.status !== 'active') return;
    this.time += dtSeconds;

    this.runNpcHealers();
    if (this.enraged && this.boss.alive) this.enrageRemaining -= dtSeconds;
    this.resolve();
  }

  private runNpcHealers(): void {
    for (const healer of this.npcs) {
      if (healer.role !== 'healer' || !healer.alive) continue;
      if (!this.isReady(healer.id)) continue;

      // In order of importance: raiders about to die, then magic effects, then everyone else.
      const dying = this.pickTarget(
        (c) => c.health <= LOW_HEALTH_THRESHOLD && c.health < c.maxHealth,
      );
      if (dying) {
        this.tryHeal(healer.id, dying.id);
        continue;
      }
      const cursed = this.pickTarget((c) => c.debuffed);
      if (cursed) {
        this.tryDispel(healer.id, cursed.id);
        continue;
      }
      const hurt = this.pickTarget((c) => c.health < c.maxHealth);
      if (hurt) this.tryHeal(healer.id, hurt.id);
    }
  }

  /**
   * The living raider matching `wanted` that an NPC healer should look after first (the lowest
   * health, by NPC_HEAL_PRIORITY), or null if none match.
   */
  private pickTarget(wanted: (c: Combatant) => boolean): Combatant | null {
    let best: Combatant | null = null;
    let bestScore = Infinity;
    for (const c of this.raiders) {
      if (!c.alive || !wanted(c)) continue;
      const score = NPC_HEAL_PRIORITY === 'lowest-percent' ? c.health / c.maxHealth : c.health;
      if (score < bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return best;
  }

  // --- Winning and wiping ----------------------------------------------------------------------

  /**
   * Checks for a wipe or a win. Run once per update, after everything that frame has happened, so
   * two deaths in the same frame (both tanks) are seen together rather than one at a time.
   */
  private resolve(): void {
    const reasons = this.wipeReasons();
    if (reasons.size > 0) {
      const top = WIPE_PRIORITY.find((r) => reasons.has(r))!;
      this.startWipe(top);
    } else if (!this.boss.alive) {
      this.status = 'won';
      this.log('The boss has been defeated!');
      this.events.push({ type: 'won' });
    } else if (this.enraged && this.enrageRemaining <= 0) {
      this.startWipe('enrage');
    }
  }

  /** Every death-related wipe that currently applies (enrage is handled separately). */
  private wipeReasons(): Set<WipeReason> {
    const reasons = new Set<WipeReason>();
    const raiders = this.raiders;
    const allDead = (members: Combatant[]): boolean =>
      members.length > 0 && members.every((c) => !c.alive);

    if (!this.player.alive) reasons.add('player-died');

    const deadTanks = raiders.filter((c) => c.role === 'tank' && !c.alive).length;
    if (deadTanks >= 2) reasons.add('both-tanks-died');
    else if (deadTanks === 1) reasons.add('tank-died');

    // The player counts toward their own role: a healer player is still a healer, so both
    // healers are only dead once the player is too (and then the player's death wins anyway).
    if (allDead(raiders.filter((c) => c.role === 'healer'))) reasons.add('healers-died');
    if (allDead(raiders.filter((c) => c.role === 'melee' || c.role === 'ranged'))) {
      reasons.add('dps-died');
    }
    return reasons;
  }

  private startWipe(reason: WipeReason): void {
    const message = pickWipeMessage(reason, this.random);
    this.status = 'wiped';
    this.wipe = { reason, message };
    this.events.push({ type: 'wiped', reason, message });
  }

  private log(text: string): void {
    this.events.push({ type: 'log', text });
  }
}
