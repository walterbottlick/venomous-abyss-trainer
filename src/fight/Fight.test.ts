import { describe, expect, it } from 'vitest';
import type { PlayerChoice } from '../game/player';
import { npcRoles, playerRaidRole } from '../raid/composition';
import {
  BOSS_MAX_HEALTH,
  ENRAGE_WIPE_DELAY_SECONDS,
  HEAL_AMOUNT,
  HEALER_COOLDOWN_SECONDS,
  MAX_HEALTH,
} from './config';
import { BOSS_ID, Fight, PLAYER_ID } from './Fight';
import { WIPE_MESSAGES } from './wipeMessages';

const healerChoice: PlayerChoice = { role: 'healer', classId: 'priest' };
const meleeChoice: PlayerChoice = { role: 'dps', range: 'melee', classId: 'rogue' };

/** A fight for the given player, with every random choice fixed so tests are repeatable. */
function fightFor(choice: PlayerChoice, random: () => number = () => 0): Fight {
  return new Fight({
    playerRole: playerRaidRole(choice),
    npcRoles: npcRoles(choice),
    random,
  });
}

/** The ids of the NPCs with the given role. */
const idsOf = (fight: Fight, role: string): string[] =>
  fight.npcs.filter((c) => c.role === role).map((c) => c.id);

describe('starting health', () => {
  it('gives tanks 200, DPS and healers 100, and the boss 400', () => {
    const fight = fightFor(healerChoice);
    for (const c of fight.raiders) {
      expect(c.health).toBe(c.role === 'tank' ? 200 : 100);
      expect(c.maxHealth).toBe(MAX_HEALTH[c.role!]);
    }
    expect(fight.boss.maxHealth).toBe(BOSS_MAX_HEALTH);
    expect(BOSS_MAX_HEALTH).toBe(400);
  });

  it('has the player and 9 NPCs, plus the boss', () => {
    const fight = fightFor(meleeChoice);
    expect(fight.raiders).toHaveLength(10);
    expect(fight.npcs).toHaveLength(9);
    expect(fight.player.role).toBe('melee');
  });
});

describe('healing', () => {
  it('heals 15 and never above the maximum', () => {
    const fight = fightFor(healerChoice);
    const target = idsOf(fight, 'melee')[0]!;
    fight.setHealth(target, 50);
    expect(fight.tryPlayerHeal(target)).toBe(true);
    expect(fight.get(target).health).toBe(50 + HEAL_AMOUNT);
    fight.update(HEALER_COOLDOWN_SECONDS + 0.01);
    fight.setHealth(target, 90);
    expect(fight.tryPlayerHeal(target)).toBe(true);
    expect(fight.get(target).health).toBe(100);
  });

  it('makes a healer wait a second between heals', () => {
    const fight = fightFor(healerChoice);
    const [a, b] = idsOf(fight, 'melee');
    fight.setHealth(a!, 50);
    fight.setHealth(b!, 50);

    expect(fight.tryPlayerHeal(a!)).toBe(true);
    expect(fight.tryPlayerHeal(b!)).toBe(false); // still on cooldown
    expect(fight.get(b!).health).toBe(50);

    fight.update(HEALER_COOLDOWN_SECONDS - 0.01);
    expect(fight.tryPlayerHeal(b!)).toBe(false);
    fight.update(0.02);
    expect(fight.tryPlayerHeal(b!)).toBe(true);
  });

  it('does not heal full-health or dead targets, or start a cooldown for them', () => {
    const fight = fightFor(healerChoice);
    const [a, b] = idsOf(fight, 'melee');
    expect(fight.tryPlayerHeal(a!)).toBe(false); // already full
    fight.setHealth(b!, 40);
    fight.kill(b!);
    expect(fight.tryPlayerHeal(b!)).toBe(false); // dead
    fight.setHealth(a!, 50);
    expect(fight.tryPlayerHeal(a!)).toBe(true); // no cooldown was started
  });

  it('only lets a healer player heal', () => {
    const fight = fightFor(meleeChoice);
    const target = idsOf(fight, 'ranged')[0]!;
    fight.setHealth(target, 50);
    expect(fight.tryPlayerHeal(target)).toBe(false);
  });

  it('lets NPC healers heal the raider with the lowest health first', () => {
    const fight = fightFor(meleeChoice);
    const [melee1, melee2] = idsOf(fight, 'melee');
    fight.setHealth(melee1!, 60);
    fight.setHealth(melee2!, 20);
    fight.update(0.1);
    expect(fight.get(melee2!).health).toBeGreaterThan(20);
    expect(fight.get(melee1!).health).toBe(60);
  });

  it('keeps NPC healers to one heal per second each', () => {
    const fight = fightFor(meleeChoice);
    const tank = idsOf(fight, 'tank')[0]!;
    fight.setHealth(tank, 10);
    // Two NPC healers, 5 seconds: at most one heal per healer per second (plus the first).
    for (let i = 0; i < 50; i++) fight.update(0.1);
    const healed = fight.get(tank).health - 10;
    expect(healed).toBeGreaterThanOrEqual(HEAL_AMOUNT * 2);
    expect(healed).toBeLessThanOrEqual(HEAL_AMOUNT * 2 * 6);
  });

  it('stops dead NPC healers from healing', () => {
    const fight = fightFor(meleeChoice);
    for (const id of idsOf(fight, 'healer')) fight.kill(id);
    fight.update(0.1); // wipes, but nothing should heal either way
    const target = idsOf(fight, 'ranged')[0]!;
    expect(fight.get(target).health).toBe(100);
  });
});

describe('the shared healer cooldown', () => {
  it('makes a dispel wait a second after a heal, and a heal wait after a dispel', () => {
    const fight = fightFor(healerChoice);
    const [a, b] = idsOf(fight, 'melee');
    fight.setHealth(a!, 50);
    fight.applyMagicDebuff(b!);

    expect(fight.tryPlayerHeal(a!)).toBe(true);
    expect(fight.tryPlayerDispel(b!)).toBe(false); // heal started the cooldown
    expect(fight.get(b!).debuffed).toBe(true);

    fight.update(HEALER_COOLDOWN_SECONDS + 0.01);
    fight.applyMagicDebuff(b!); // the NPC healer may have cleared it meanwhile
    expect(fight.tryPlayerDispel(b!)).toBe(true);
    fight.setHealth(a!, 40);
    expect(fight.tryPlayerHeal(a!)).toBe(false); // dispel started it again
    fight.update(HEALER_COOLDOWN_SECONDS + 0.01);
    expect(fight.tryPlayerHeal(a!)).toBe(true);
  });

  it('does not start a cooldown when there is nothing to dispel', () => {
    const fight = fightFor(healerChoice);
    const [a, b] = idsOf(fight, 'melee');
    expect(fight.tryPlayerDispel(a!)).toBe(false); // no debuff
    fight.setHealth(b!, 50);
    expect(fight.tryPlayerHeal(b!)).toBe(true); // still free to act
  });
});

describe('NPC healers and dispels', () => {
  /** A fight with exactly one NPC healer (the player is the other healer). */
  const oneNpcHealer = (): Fight => fightFor(healerChoice);

  it('heal a raider at 30 health or less before dispelling', () => {
    const fight = oneNpcHealer();
    const [low, cursed] = idsOf(fight, 'ranged');
    fight.setHealth(low!, 20);
    fight.applyMagicDebuff(cursed!);

    fight.update(0.1); // the NPC healer's first action
    expect(fight.get(low!).health).toBe(35);
    expect(fight.get(cursed!).debuffed).toBe(true);

    fight.update(HEALER_COOLDOWN_SECONDS); // its next action
    expect(fight.get(cursed!).debuffed).toBe(false);
  });

  it('dispel before healing a raider who is hurt but above 30', () => {
    const fight = oneNpcHealer();
    const [hurt, cursed] = idsOf(fight, 'ranged');
    fight.setHealth(hurt!, 60);
    fight.applyMagicDebuff(cursed!);

    fight.update(0.1);
    expect(fight.get(cursed!).debuffed).toBe(false);
    expect(fight.get(hurt!).health).toBe(60);

    fight.update(HEALER_COOLDOWN_SECONDS);
    expect(fight.get(hurt!).health).toBe(75);
  });

  it('dispel the player too', () => {
    const fight = oneNpcHealer();
    fight.applyMagicDebuff(PLAYER_ID);
    fight.update(0.1);
    expect(fight.player.debuffed).toBe(false);
  });

  it('spread the work: two healers dispel one raider and heal another in the same moment', () => {
    const fight = fightFor(meleeChoice); // two NPC healers
    const [hurt, cursed] = idsOf(fight, 'ranged');
    fight.setHealth(hurt!, 60);
    fight.applyMagicDebuff(cursed!);

    fight.update(0.1);
    expect(fight.get(cursed!).debuffed).toBe(false);
    expect(fight.get(hurt!).health).toBe(75);
  });

  it('only cast once a second each, dispels included', () => {
    const fight = oneNpcHealer();
    const ids = idsOf(fight, 'ranged').concat(idsOf(fight, 'melee'));
    ids.forEach((id) => fight.applyMagicDebuff(id));
    fight.update(0.1);
    expect(ids.filter((id) => !fight.get(id).debuffed)).toHaveLength(1);
    fight.update(0.5);
    expect(ids.filter((id) => !fight.get(id).debuffed)).toHaveLength(1);
    fight.update(0.5);
    expect(ids.filter((id) => !fight.get(id).debuffed)).toHaveLength(2);
  });
});

describe('dispelling', () => {
  it('lets a healer player remove a debuff immediately', () => {
    const fight = fightFor(healerChoice);
    const target = idsOf(fight, 'ranged')[0]!;
    fight.applyMagicDebuff(target);
    expect(fight.get(target).debuffed).toBe(true);
    expect(fight.tryPlayerDispel(target)).toBe(true);
    expect(fight.get(target).debuffed).toBe(false);
  });

  it('does not let a non-healer dispel', () => {
    const fight = fightFor(meleeChoice);
    const target = idsOf(fight, 'ranged')[0]!;
    fight.applyMagicDebuff(target);
    expect(fight.tryPlayerDispel(target)).toBe(false);
    expect(fight.get(target).debuffed).toBe(true);
  });
});

describe('death and the log', () => {
  it('kills at 0 health and logs the role', () => {
    const fight = fightFor(healerChoice);
    const ranged = idsOf(fight, 'ranged')[0]!;
    fight.damage(ranged, 500);
    expect(fight.get(ranged).alive).toBe(false);
    expect(fight.get(ranged).health).toBe(0);
    const events = fight.drainEvents();
    expect(events).toContainEqual({ type: 'died', id: ranged });
    expect(events).toContainEqual({ type: 'log', text: 'Ranged DPS has died!' });
  });

  it('names each role in its log message', () => {
    const fight = fightFor(healerChoice);
    for (const [role, text] of [
      ['melee', 'Melee DPS has died!'],
      ['healer', 'Healer has died!'],
      ['tank', 'Tank has died!'],
    ] as const) {
      fight.kill(idsOf(fight, role)[0]!);
      expect(fight.drainEvents()).toContainEqual({ type: 'log', text });
    }
  });

  it('cannot heal the dead', () => {
    const fight = fightFor(healerChoice);
    const id = idsOf(fight, 'melee')[0]!;
    fight.kill(id);
    expect(fight.heal(id)).toBe(0);
    expect(fight.get(id).alive).toBe(false);
  });
});

describe('wiping', () => {
  it('wipes when the player dies, with a player-death message', () => {
    const fight = fightFor(meleeChoice);
    fight.kill(PLAYER_ID);
    fight.update(0);
    expect(fight.status).toBe('wiped');
    expect(fight.wipe?.reason).toBe('player-died');
    expect(WIPE_MESSAGES['player-died']).toContain(fight.wipe!.message);
  });

  it('wipes when one tank dies', () => {
    const fight = fightFor(meleeChoice);
    fight.kill(idsOf(fight, 'tank')[0]!);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('tank-died');
    expect(fight.wipe?.message).toBe("You got the tank killed! The other one can't do it alone!");
  });

  it('reports both tanks when they die in the same frame', () => {
    const fight = fightFor(meleeChoice);
    for (const id of idsOf(fight, 'tank')) fight.kill(id);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('both-tanks-died');
  });

  it('wipes when every healer is an NPC and they all die', () => {
    const fight = fightFor(meleeChoice);
    const [first, second] = idsOf(fight, 'healer');
    fight.kill(first!);
    fight.update(0);
    expect(fight.status).toBe('active'); // one healer is still alive
    fight.kill(second!);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('healers-died');
  });

  it('does not wipe a healer player just because the NPC healer died', () => {
    const fight = fightFor(healerChoice);
    fight.kill(idsOf(fight, 'healer')[0]!);
    fight.update(0);
    expect(fight.status).toBe('active');
  });

  it('wipes when all DPS die and the player is not DPS', () => {
    const fight = fightFor(healerChoice);
    const dps = [...idsOf(fight, 'melee'), ...idsOf(fight, 'ranged')];
    dps.slice(0, -1).forEach((id) => fight.kill(id));
    fight.update(0);
    expect(fight.status).toBe('active');
    fight.kill(dps[dps.length - 1]!);
    fight.update(0);
    expect(fight.wipe?.reason).toBe('dps-died');
  });

  it('does not wipe a DPS player who is still alive when every NPC DPS dies', () => {
    const fight = fightFor(meleeChoice);
    for (const id of [...idsOf(fight, 'melee'), ...idsOf(fight, 'ranged')]) fight.kill(id);
    fight.update(0);
    expect(fight.status).toBe('active');
  });

  it('prefers the player-death message when several things happen at once', () => {
    const fight = fightFor(meleeChoice);
    fight.kill(PLAYER_ID);
    for (const id of idsOf(fight, 'tank')) fight.kill(id);
    for (const id of idsOf(fight, 'healer')) fight.kill(id);
    fight.enrageBoss();
    fight.update(ENRAGE_WIPE_DELAY_SECONDS + 1);
    expect(fight.wipe?.reason).toBe('player-died');
    expect(WIPE_MESSAGES['player-died']).toContain(fight.wipe!.message);
  });

  it('ignores further changes once wiped', () => {
    const fight = fightFor(meleeChoice);
    fight.kill(PLAYER_ID);
    fight.update(0);
    const other = idsOf(fight, 'ranged')[0]!;
    fight.kill(other);
    expect(fight.get(other).alive).toBe(true);
  });
});

describe('enrage', () => {
  it('wipes after the countdown if the boss is still alive', () => {
    const fight = fightFor(healerChoice);
    fight.enrageBoss();
    expect(fight.enraged).toBe(true);
    fight.update(ENRAGE_WIPE_DELAY_SECONDS - 0.1);
    expect(fight.status).toBe('active');
    fight.update(0.2);
    expect(fight.wipe?.reason).toBe('enrage');
  });

  it('gives the raid the whole countdown to kill the boss', () => {
    const fight = fightFor(healerChoice);
    fight.enrageBoss();
    fight.update(ENRAGE_WIPE_DELAY_SECONDS - 1);
    fight.kill(BOSS_ID);
    fight.update(2);
    expect(fight.status).toBe('won');
    expect(fight.wipe).toBeNull();
  });

  it('lets the boss be set to 100 health', () => {
    const fight = fightFor(healerChoice);
    fight.setHealth(BOSS_ID, 100);
    expect(fight.boss.health).toBe(100);
  });
});
