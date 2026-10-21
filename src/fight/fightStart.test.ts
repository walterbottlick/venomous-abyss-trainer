import { describe, expect, it } from 'vitest';
import { distance } from '../game/geometry';
import type { PlayerChoice } from '../game/player';
import { npcRoles, playerRaidRole } from '../raid/composition';
import { BossMovement } from './bossMovement';
import { countdownNumber } from './countdown';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';
import { clumpPositions } from './formation';

describe('the starting huddle', () => {
  it('fits everyone without overlap, with the first in the middle', () => {
    const centre = { x: 345, y: 480 };
    const spacing = 30;
    const spots = clumpPositions(centre, 10, spacing);
    expect(spots).toHaveLength(10);
    expect(spots[0]).toEqual(centre);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(distance(spots[i]!, spots[j]!)).toBeGreaterThanOrEqual(spacing - 0.001);
      }
    }
  });

  it('keeps everyone close together', () => {
    const centre = { x: 100, y: 100 };
    for (const spot of clumpPositions(centre, 10, 30)) {
      expect(distance(spot, centre)).toBeLessThanOrEqual(30 * 2 + 0.001);
    }
  });
});

describe('the 3-2-1 countdown', () => {
  it('shows 3, then 2, then 1, then ends', () => {
    expect(countdownNumber(0, 3)).toBe(3);
    expect(countdownNumber(0.99, 3)).toBe(3);
    expect(countdownNumber(1, 3)).toBe(2);
    expect(countdownNumber(2.5, 3)).toBe(1);
    expect(countdownNumber(3, 3)).toBeNull();
    expect(countdownNumber(10, 3)).toBeNull();
  });
});

describe('boss movement', () => {
  const options = { runSpeed: 100, relocateSpeed: 50, contactDistance: 8 };
  const tank = (x: number, y: number) => [{ pos: { x, y }, radius: 12 }];

  it('stays put when it has no destination', () => {
    const boss = new BossMovement({ ...options, start: { x: 100, y: 100 } });
    expect(boss.inPosition).toBe(true);
    boss.begin();
    boss.update(1, tank(100, 300), 24);
    expect(boss.position).toEqual({ x: 100, y: 100 });
  });

  it('waits for the countdown before doing anything', () => {
    const boss = new BossMovement({
      ...options,
      start: { x: 100, y: 100 },
      destination: { x: 300, y: 100 },
    });
    expect(boss.state).toBe('waiting');
    boss.update(1, tank(100, 300), 24);
    expect(boss.position).toEqual({ x: 100, y: 100 });
    expect(boss.inPosition).toBe(false);
  });

  it('runs at the tanks, then once in contact takes the long way to its destination', () => {
    const boss = new BossMovement({
      ...options,
      start: { x: 100, y: 100 },
      destination: { x: 300, y: 100 },
    });
    boss.begin();

    // Runs toward a tank straight below it.
    boss.update(1, tank(100, 400), 24);
    expect(boss.state).toBe('meeting');
    expect(boss.position.y).toBeGreaterThan(100);
    expect(boss.position.x).toBe(100);

    // Once a tank is touching it, the tanks take it to the destination.
    boss.update(0.01, tank(boss.position.x, boss.position.y + 24 + 12 + 2), 24);
    expect(boss.state).toBe('relocating');

    const before = distance(boss.position, { x: 300, y: 100 });
    boss.update(1, tank(0, 0), 24);
    expect(distance(boss.position, { x: 300, y: 100 })).toBeLessThan(before);
    // Slower while being led than while running.
    expect(before - distance(boss.position, { x: 300, y: 100 })).toBeLessThanOrEqual(50.001);

    for (let i = 0; i < 100; i++) boss.update(1, tank(0, 0), 24);
    expect(boss.state).toBe('arrived');
    expect(boss.position).toEqual({ x: 300, y: 100 });
    expect(boss.inPosition).toBe(true);
  });
});

describe('what the raid focuses on', () => {
  const choice: PlayerChoice = { role: 'dps', range: 'melee', classId: 'rogue' };
  const fightFor = (): Fight =>
    new Fight({
      playerRole: playerRaidRole(choice),
      npcRoles: npcRoles(choice),
      playerRangeMeters: 2,
      random: () => 0,
    });

  it('attacks the boss by default', () => {
    const fight = fightFor();
    expect(fight.focusId).toBe(BOSS_ID);
    fight.setInRange(PLAYER_ID, true);
    fight.update(0.1);
    expect(fight.boss.health).toBe(fight.boss.maxHealth - 1);
  });

  it('does no damage to the boss while focused elsewhere, but still reports the attacks', () => {
    const fight = fightFor();
    fight.setFocus('shrouded-0');
    fight.setInRange(PLAYER_ID, true);
    fight.update(0.1);
    expect(fight.boss.health).toBe(fight.boss.maxHealth);
    expect(fight.drainEvents()).toContainEqual({
      type: 'attacked',
      id: PLAYER_ID,
      targetId: 'shrouded-0',
    });
  });

  it('counts the living DPS, the player included', () => {
    const fight = fightFor();
    expect(fight.aliveDpsCount).toBe(6);
    fight.kill(fight.npcs.find((c) => c.role === 'ranged')!.id);
    expect(fight.aliveDpsCount).toBe(5);
  });
});
