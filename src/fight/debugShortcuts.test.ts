import { describe, expect, it } from 'vitest';
import { npcRoles, playerRaidRole } from '../raid/composition';
import type { PlayerChoice } from '../game/player';
import { runDebugShortcut } from './debugShortcuts';
import { Fight } from './Fight';

const healer: PlayerChoice = { role: 'healer', classId: 'priest' };
const melee: PlayerChoice = { role: 'dps', range: 'melee', classId: 'rogue' };

const fightFor = (choice: PlayerChoice): Fight =>
  new Fight({ playerRole: playerRaidRole(choice), npcRoles: npcRoles(choice), random: () => 0 });

describe('testing shortcuts', () => {
  it('1: sets DPS and healers to 30 (player too) and tanks to 100', () => {
    const fight = fightFor(healer);
    runDebugShortcut(fight, 1);
    for (const c of fight.raiders) expect(c.health).toBe(c.role === 'tank' ? 100 : 30);
  });

  it('2: debuffs every raider', () => {
    const fight = fightFor(healer);
    runDebugShortcut(fight, 2);
    expect(fight.raiders.every((c) => c.debuffed)).toBe(true);
  });

  it('3: kills one NPC DPS', () => {
    const fight = fightFor(healer);
    runDebugShortcut(fight, 3);
    const dead = fight.npcs.filter((c) => !c.alive);
    expect(dead).toHaveLength(1);
    expect(['melee', 'ranged']).toContain(dead[0]!.role);
  });

  it('4: kills one NPC healer, and a second wipes the raid if the player is not a healer', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 4);
    fight.update(0);
    expect(fight.status).toBe('active');
    runDebugShortcut(fight, 4);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('healers-died');
  });

  it('5: kills a tank and wipes', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 5);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('tank-died');
  });

  it('6: enrages the boss', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 6);
    expect(fight.enraged).toBe(true);
  });

  it('7: sets the boss to 100 health', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 7);
    expect(fight.boss.health).toBe(100);
  });

  it('8: kills both tanks at once', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 8);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('both-tanks-died');
  });

  it('9: kills the player, which wipes', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 9);
    fight.update(0);
    expect(fight.player.alive).toBe(false);
    expect(fight.wipe?.reason).toBe('player-died');
  });

  it('0: kills the boss, which wins the fight', () => {
    const fight = fightFor(melee);
    runDebugShortcut(fight, 0);
    fight.update(0);
    expect(fight.boss.alive).toBe(false);
    expect(fight.status).toBe('won');
    expect(fight.wipe).toBeNull();
  });

  it('ignores numbers that are not shortcuts', () => {
    expect(runDebugShortcut(fightFor(melee), 10)).toBe(false);
  });
});
