import Phaser from 'phaser';
import { markerKey } from '../assets/manifest';
import type { Vec2 } from '../game/movement';
import type { PlayerChoice } from '../game/player';
import { npcRoles, playerRaidRole } from '../raid/composition';
import { RaidGroup } from '../raid/RaidGroup';
import { AttackEffects } from '../ui/attackEffects';
import { CombatLog, type LogArea } from '../ui/combatLog';
import { createPlayerToken } from '../ui/playerToken';
import { TokenView } from '../ui/tokenView';
import { showVictoryScreen, showWipeScreen } from '../ui/endScreen';
import { HEALTH_RING_COLOR, LOW_HEALTH_THRESHOLD, PLAYER_RING_SHOWS_HEALTH } from './config';
import { attackStyleFor } from './attackStyles';
import { installDebugShortcuts } from './debugShortcuts';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';
import { isInRange, rangeMetersFor } from './ranges';

export interface FightRuntimeOptions {
  choice: PlayerChoice;
  /** Size of the play area. The wipe screen covers exactly this. */
  arena: { width: number; height: number };
  boss: {
    pos: Vec2;
    /** Diameter of the boss icon. */
    size: number;
    textureKey: string;
    /** Defaults to BOSS_MAX_HEALTH. */
    maxHealth?: number;
  };
  playerStart: Vec2;
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
 * rules (`Fight`), the player, boss and NPC icons with their health rings and overlays, clicking
 * to heal (left) and dispel (right), the fight log, and the wipe screen. Create it in `create()`
 * and call `update()` every frame.
 */
export class FightRuntime {
  readonly fight: Fight;

  private readonly scene: Phaser.Scene;
  private readonly arena: { width: number; height: number };
  private readonly playerToken: TokenView;
  private readonly bossToken: TokenView;
  private readonly raid: RaidGroup;
  private readonly log: CombatLog;
  private readonly effects: AttackEffects;
  private readonly endActions: { onRetry: () => void; onExit: () => void };
  private readonly choice: PlayerChoice;
  /** Icon radii, for working out attack range and where attack animations start and end. */
  private readonly radii: { player: number; npc: number; boss: number };
  /** Where the boss currently is. Updated every frame; attack animations home in on it. */
  private bossPos: Vec2;

  constructor(scene: Phaser.Scene, options: FightRuntimeOptions) {
    const { choice, arena, boss } = options;
    this.scene = scene;
    this.arena = arena;
    this.endActions = { onRetry: options.onRetry, onExit: options.onExit };
    this.choice = choice;
    this.bossPos = { ...boss.pos };
    this.radii = {
      player: options.playerSize / 2,
      npc: options.npcSize / 2,
      boss: boss.size / 2,
    };

    this.fight = new Fight({
      playerRole: playerRaidRole(choice),
      npcRoles: npcRoles(choice),
      bossMaxHealth: boss.maxHealth,
      // Only a DPS player attacks; a healer's range is never used.
      playerRangeMeters:
        choice.role === 'dps' ? rangeMetersFor(choice.classId, choice.range ?? 'ranged') : 0,
      random: options.random,
    });

    // Created back to front: boss, then the NPCs, then the player on top.
    this.bossToken = new TokenView(scene, {
      x: boss.pos.x,
      y: boss.pos.y,
      size: boss.size,
      ringColor: HEALTH_RING_COLOR,
      art: { key: boss.textureKey, size: boss.size },
      crossKey: markerKey('cross'),
      removeAfterDeath: false,
    });
    this.raid = new RaidGroup(scene, {
      choice,
      fight: this.fight,
      boss: boss.pos,
      bossRadius: boss.size / 2,
      npcSize: options.npcSize,
      arena,
      random: options.random,
    });
    this.playerToken = createPlayerToken(
      scene,
      options.playerStart.x,
      options.playerStart.y,
      choice.classId,
      options.playerSize,
    );
    this.log = new CombatLog(scene, options.logArea);
    this.effects = new AttackEffects(scene);

    // Left-click heals, right-click dispels. Both only work for a healer player (see Fight).
    this.playerToken.onClick((button) => this.click(PLAYER_ID, button));
    for (const npc of this.fight.npcs) {
      this.raid.tokenFor(npc.id)?.onClick((button) => this.click(npc.id, button));
    }
    // Stop the browser's right-click menu popping up over the game.
    const stopMenu = (e: Event): void => e.preventDefault();
    scene.game.canvas.addEventListener('contextmenu', stopMenu);
    scene.events.once('shutdown', () =>
      scene.game.canvas.removeEventListener('contextmenu', stopMenu),
    );

    installDebugShortcuts(scene, this.fight);
  }

  /** Whether the player can move and act: they are alive and the fight is still going. */
  get playerCanAct(): boolean {
    return this.fight.status === 'active' && this.fight.player.alive;
  }

  setPlayerPosition(x: number, y: number): void {
    this.playerToken.setPosition(x, y);
  }

  /** Advance the fight by one frame. `bossPos` is where the boss currently stands. */
  update(dtSeconds: number, bossPos: Vec2): void {
    this.bossPos = bossPos;
    this.updateRanges();
    this.fight.update(dtSeconds);
    for (const event of this.fight.drainEvents()) {
      switch (event.type) {
        case 'healed':
          this.tokenFor(event.id)?.flashHeal();
          break;
        case 'attacked':
          this.showAttack(event.id);
          break;
        case 'died':
          // The boss's own defeat is shown by the fight ending, not by darkening it.
          if (event.id !== BOSS_ID) this.tokenFor(event.id)?.die();
          break;
        case 'log':
          this.log.add(event.text);
          break;
        case 'wiped':
          showWipeScreen(this.scene, this.arena, event.message, this.endActions);
          break;
        case 'won':
          showVictoryScreen(this.scene, this.arena, this.endActions);
          break;
        default:
          break;
      }
    }

    this.syncTokens();
    this.bossToken.setPosition(bossPos.x, bossPos.y);
    this.raid.update(dtSeconds, bossPos);
    this.playerToken.update(dtSeconds);
    this.bossToken.update(dtSeconds);
    this.effects.update(dtSeconds);
  }

  /** Tells the fight which DPS are currently close enough to the boss to attack. */
  private updateRanges(): void {
    for (const c of this.fight.raiders) {
      if (c.role !== 'melee' && c.role !== 'ranged') continue;
      const token = this.tokenFor(c.id);
      if (!token || !c.alive) continue;
      const radius = c.kind === 'player' ? this.radii.player : this.radii.npc;
      this.fight.setInRange(
        c.id,
        isInRange(token.position, radius, this.bossPos, this.radii.boss, c.rangeMeters),
      );
    }
  }

  /** Plays the attack animation for a DPS: a swipe for melee, a homing dot for ranged. */
  private showAttack(id: string): void {
    const c = this.fight.get(id);
    const token = this.tokenFor(id);
    if (!token || !c.role) return;
    const classId = c.kind === 'player' ? this.choice.classId : undefined;
    const radius = c.kind === 'player' ? this.radii.player : this.radii.npc;
    this.effects.spawn(
      attackStyleFor(c.role, classId),
      () => token.position,
      radius,
      () => this.bossPos,
      this.radii.boss,
    );
  }

  private click(id: string, button: 'left' | 'right'): void {
    if (button === 'left') this.fight.tryPlayerHeal(id);
    else this.fight.tryPlayerDispel(id);
  }

  private tokenFor(id: string): TokenView | undefined {
    if (id === PLAYER_ID) return this.playerToken;
    if (id === BOSS_ID) return this.bossToken;
    return this.raid.tokenFor(id);
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
      if (c.kind === 'boss') token.setEnraged(this.fight.enraged && c.alive);
    }
  }
}
