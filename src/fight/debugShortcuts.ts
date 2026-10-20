import type Phaser from 'phaser';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';

/**
 * TESTING SHORTCUTS - remove this file (and its use in FightRuntime) once the project is done.
 *
 * Hold Shift + Alt and press a number:
 *   1  tanks to half health (100), everyone else 30, the player included
 *   2  hit every raider with a magic effect that needs dispelling
 *   3  kill a random NPC DPS
 *   4  kill a random NPC healer
 *   5  kill a random NPC tank
 *   6  enrage the boss
 *   7  set the boss's health to 100
 *   8  kill both tanks
 *   9  kill the player
 *   0  kill the boss
 */

const pickOne = <T>(items: T[], random: () => number): T | undefined =>
  items[Math.floor(random() * items.length)];

/** Runs shortcut number `n` (0-9) on the fight. Returns false if `n` is not a shortcut. */
export function runDebugShortcut(
  fight: Fight,
  n: number,
  random: () => number = Math.random,
): boolean {
  const livingNpcs = fight.npcs.filter((c) => c.alive);

  switch (n) {
    case 1:
      for (const c of fight.raiders) {
        if (c.alive) fight.setHealth(c.id, c.role === 'tank' ? 100 : 30);
      }
      return true;
    case 2:
      for (const c of fight.raiders) fight.applyMagicDebuff(c.id);
      return true;
    case 3: {
      const dps = livingNpcs.filter((c) => c.role === 'melee' || c.role === 'ranged');
      const victim = pickOne(dps, random);
      if (victim) fight.kill(victim.id);
      return true;
    }
    case 4: {
      const victim = pickOne(
        livingNpcs.filter((c) => c.role === 'healer'),
        random,
      );
      if (victim) fight.kill(victim.id);
      return true;
    }
    case 5: {
      const victim = pickOne(
        livingNpcs.filter((c) => c.role === 'tank'),
        random,
      );
      if (victim) fight.kill(victim.id);
      return true;
    }
    case 6:
      fight.enrageBoss();
      return true;
    case 7:
      fight.setHealth(BOSS_ID, 100);
      return true;
    case 8:
      // Both in the same frame, so the wipe sees them together.
      for (const c of livingNpcs.filter((c) => c.role === 'tank')) fight.kill(c.id);
      return true;
    case 9:
      fight.kill(PLAYER_ID);
      return true;
    case 0:
      fight.kill(BOSS_ID);
      return true;
    default:
      return false;
  }
}

/** Listens for Shift + Alt + 0..9 on the scene's keyboard. */
export function installDebugShortcuts(scene: Phaser.Scene, fight: Fight): void {
  scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
    if (!event.shiftKey || !event.altKey) return;
    // `code` is the physical key; `key` would be "!" or "@" with Shift held.
    const match = /^Digit([0-9])$/.exec(event.code);
    if (!match) return;
    event.preventDefault();
    runDebugShortcut(fight, Number(match[1]));
  });
}
