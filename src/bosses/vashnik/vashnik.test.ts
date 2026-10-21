import { describe, expect, it } from 'vitest';
import type { EncounterContext } from '../../fight/encounter';
import { BOSS_ID, Fight, PLAYER_ID } from '../../fight/Fight';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../../game/config';
import {
  closestPointOnPolygon,
  distance,
  distanceToPolygon,
  pointInPolygon,
} from '../../game/geometry';
import type { Vec2 } from '../../game/movement';
import type { ClassId, PlayerChoice } from '../../game/player';
import { npcRoles, playerRaidRole } from '../../raid/composition';
import {
  BANISH_PROMPT,
  BURNING_KILL_BASE,
  SHROUDED_KILL_BASE,
  BILE_AREA,
  FOUNTAIN_AREAS,
  BILE_AFTER_TOTEM_RESET_SECONDS,
  ENRAGE_SECONDS,
  FIRST_FROTH_SECONDS,
  FROTH_AFTER_BILE_SECONDS,
  FROTH_AIM_PROMPT,
  FROTH_MARKER_PROMPT,
  FROTH_TOTEM_PROMPT,
  IMBIBE_AFTER_FROTH_SECONDS,
  MARKER_BOSS_OFFSET,
  MARKER_TANK_SPOT,
  PLAGUE_FROTH_START_DISTANCE,
  TOTEM_RESET_COUNT,
  TOTEM_RESET_DISTANCE,
  BOSS_DESTINATION,
  BOSS_START,
  BURNING_DEATH_DAMAGE,
  CATALYTIC_BILE_DURATION_SECONDS,
  CATALYTIC_BILE_PROMPT,
  CATALYTIC_BILE_RADIUS,
  CATALYTIC_BILE_WARNING_SECONDS,
  BURNING_VENOM_COUNT,
  DEATH_GRIP_PROMPT,
  DISPEL_PROMPT,
  EXPLODING_INFECTION_DAMAGE,
  FIRE_FOUNTAIN,
  FOCUS_PROMPT,
  GRIP_DELAY_SECONDS,
  MALIGNANT_TOTEM_COUNT,
  MALIGNANT_TOTEM_DELAY_SECONDS,
  MALIGNANT_TOTEM_SIZE_FACTOR,
  MINION_MIN_SEPARATION,
  MINION_SPAWN_DELAY_SECONDS,
  MINION_SPEED,
  PLAGUE_FROTH_DELAY_SECONDS,
  PLAGUE_FROTH_TARGET_COUNT,
  POOL_POLYGON,
  POOL_TARGET,
  SHADOW_FOUNTAIN,
  SHROUDED_VENOM_COUNT,
  STYGIAN_INFECTION_DELAY_SECONDS,
  STYGIAN_PROMPT,
  ZONE_COUNT,
  ZONE_DELAY_SECONDS,
  ZONE_RADIUS,
} from './config';
import { VashnikEncounter, type Minion } from './VashnikEncounter';

/** Small, repeatable random numbers for tests. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choices: Record<string, PlayerChoice> = {
  healer: { role: 'healer', classId: 'priest' },
  rogue: { role: 'dps', range: 'melee', classId: 'rogue' },
  deathKnight: { role: 'dps', range: 'melee', classId: 'death-knight' },
  warlock: { role: 'dps', range: 'ranged', classId: 'warlock' },
};

/** A fight and an encounter, with every NPC standing safely at the bottom of the room. */
/** How long the raid needs for each kind of minion with the default 6 DPS alive (see the config). */
const SHROUDED_SECONDS = SHROUDED_KILL_BASE - 6;
const BURNING_SECONDS = BURNING_KILL_BASE - 6;

function setup(
  choice: PlayerChoice,
  classId: ClassId = choice.classId,
  seed = 7,
  scripted = false,
) {
  const random = seeded(seed);
  const fight = new Fight({
    playerRole: playerRaidRole(choice),
    npcRoles: npcRoles(choice),
    playerRangeMeters: 2,
    random: () => 0,
  });
  const encounter = new VashnikEncounter({ fight, playerClassId: classId, random, scripted });

  // A DPS player starts out in range of whatever they attack; tests move them out when needed.
  if (choice.role === 'dps') fight.setInRange(PLAYER_ID, true);

  const playerPos: Vec2 = { x: 345, y: 420 };
  const npcPositions = new Map<string, Vec2>();
  fight.npcs.forEach((c, i) => npcPositions.set(c.id, { x: 200 + i * 30, y: 500 }));

  /** Where the tanks were told to take the boss, in order. */
  const bossMoves: Vec2[] = [];
  const context: EncounterContext = {
    fight,
    bossPos: BOSS_DESTINATION,
    bossInPosition: true,
    playerPos,
    playerRadius: 16,
    npcRadius: 12,
    npcPos: (id) => npcPositions.get(id),
    moveBoss: (destination) => {
      bossMoves.push({ ...destination });
    },
    tanks: () =>
      fight.npcs
        .filter((c) => c.role === 'tank' && c.alive)
        .map((c) => ({ id: c.id, pos: npcPositions.get(c.id)! })),
  };

  /**
   * Stygian Infection drops a purple circle under the player every second, so by default the
   * test player keeps walking in a circle, like a real player would. Set `state.walking = false` to hold the player still (or to place them yourself).
   */
  const state = { walking: true };
  let clock = 0;

  /** Runs the encounter forward `seconds` in small steps, like frames. */
  const run = (seconds: number, step = 0.05): void => {
    for (let t = 0; t < seconds - 1e-9; t += step) {
      clock += step;
      if (state.walking) {
        // A lap of a circle every 3 seconds. A purple circle explodes 2 seconds after it drops,
        // by which time the player is a third of a lap (about 200 pixels) away from it.
        const angle = (clock / 3) * Math.PI * 2;
        playerPos.x = 345 + Math.cos(angle) * 120;
        playerPos.y = 380 + Math.sin(angle) * 120;
      }
      fight.update(step);
      encounter.update(step, context);
    }
  };
  /** Runs until just after the minions appear, leaving Exploding Infection (if any) on everyone. */
  const imbibeWithMagic = (): void => {
    encounter.triggerImbibe();
    run(MINION_SPAWN_DELAY_SECONDS + 0.1);
  };
  /** Runs until just after the minions appear, then dispels Exploding Infection so it cannot get in the way. */
  const imbibe = (): void => {
    imbibeWithMagic();
    for (const raider of fight.raiders) fight.dispel(raider.id);
  };
  const ofKind = (kind: 'shrouded' | 'burning') => encounter.minions.filter((m) => m.kind === kind);
  const dpsNpcs = () => fight.npcs.filter((c) => c.role === 'melee' || c.role === 'ranged');

  encounter.update(0, context); // so it has seen the fight, as it would in the first frame

  return {
    fight,
    encounter,
    bossMoves,
    context,
    playerPos,
    npcPositions,
    state,
    run,
    imbibe,
    imbibeWithMagic,
    ofKind,
    dpsNpcs,
  };
}

describe('Vashnik: positions', () => {
  it('starts Vashnik just below the pool, not in it', () => {
    expect(pointInPolygon(BOSS_START, POOL_POLYGON)).toBe(false);
    // His whole icon (radius 24) is clear of the pool.
    expect(distanceToPolygon(BOSS_START, POOL_POLYGON)).toBeGreaterThan(24);
    expect(BOSS_START.y).toBeGreaterThan(Math.max(...POOL_POLYGON.map((p) => p.y)));
  });

  it('takes him two thirds of the way from his start to the bottom-right corner', () => {
    const corner = { x: ARENA_WIDTH, y: ARENA_HEIGHT };
    expect(BOSS_DESTINATION.x).toBeCloseTo(BOSS_START.x + ((corner.x - BOSS_START.x) * 2) / 3);
    expect(BOSS_DESTINATION.y).toBeCloseTo(BOSS_START.y + ((corner.y - BOSS_START.y) * 2) / 3);
  });

  it('has the fountains in the bottom corners, outside the pool', () => {
    expect(FIRE_FOUNTAIN.x).toBeLessThan(ARENA_WIDTH / 2);
    expect(SHADOW_FOUNTAIN.x).toBeGreaterThan(ARENA_WIDTH / 2);
    expect(FIRE_FOUNTAIN.y).toBeGreaterThan(ARENA_HEIGHT / 2);
    expect(pointInPolygon(FIRE_FOUNTAIN, POOL_POLYGON)).toBe(false);
    expect(pointInPolygon(POOL_TARGET, POOL_POLYGON)).toBe(true);
  });
});

describe('Vashnik: the acid pool', () => {
  it('kills the player who steps into it', () => {
    const { fight, context, encounter } = setup(choices.rogue!);
    context.playerPos.x = POOL_TARGET.x;
    context.playerPos.y = POOL_TARGET.y;
    encounter.update(0.05, context);
    expect(fight.player.alive).toBe(false);
  });

  it('kills an NPC who ends up in it', () => {
    const { fight, context, encounter, npcPositions } = setup(choices.rogue!);
    const victim = fight.npcs[0]!;
    npcPositions.set(victim.id, { ...POOL_TARGET });
    encounter.update(0.05, context);
    expect(victim.alive).toBe(false);
  });

  it('does not touch anyone standing outside it', () => {
    const { fight, run } = setup(choices.rogue!);
    run(1);
    expect(fight.raiders.every((c) => c.alive)).toBe(true);
  });
});

describe('Vashnik: Imbibe', () => {
  it('brings out the minions a few seconds after Vashnik starts to imbibe', () => {
    const { encounter, run } = setup(choices.rogue!);
    run(2);
    expect(encounter.minions).toHaveLength(0); // nothing starts it by itself, unscripted
    encounter.triggerImbibe();
    run(MINION_SPAWN_DELAY_SECONDS - 0.5);
    expect(encounter.minions).toHaveLength(0);
    run(0.7);
    expect(encounter.minions).toHaveLength(SHROUDED_VENOM_COUNT + BURNING_VENOM_COUNT);
  });

  it('sends 5 Shrouded Venom from the bottom right and 3 Burning Venom from the bottom left', () => {
    const { imbibe, ofKind } = setup(choices.rogue!);
    imbibe();
    expect(ofKind('shrouded')).toHaveLength(5);
    expect(ofKind('burning')).toHaveLength(3);
    for (const m of ofKind('shrouded')) expect(distance(m.pos, SHADOW_FOUNTAIN)).toBeLessThan(80);
    for (const m of ofKind('burning')) expect(distance(m.pos, FIRE_FOUNTAIN)).toBeLessThan(80);
  });

  it('spreads the minions out rather than stacking them', () => {
    const { imbibe, encounter } = setup(choices.rogue!);
    imbibe();
    const spots = encounter.minions;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(distance(spots[i]!.pos, spots[j]!.pos)).toBeGreaterThan(MINION_MIN_SEPARATION * 0.6);
      }
    }
  });

  it('moves the minions slowly toward the pool', () => {
    const { imbibe, encounter, run, ofKind } = setup(choices.rogue!);
    imbibe();
    // The ones being gripped jump about; look at the one left walking from the spawn.
    const shrouded = ofKind('shrouded')[0]!;
    const before = distance(shrouded.pos, POOL_TARGET);
    run(2);
    const moved = before - distance(shrouded.pos, POOL_TARGET);
    expect(moved).toBeGreaterThan(MINION_SPEED * 1.5);
    expect(moved).toBeLessThan(MINION_SPEED * 2.5);
    expect(encounter.minions.every((m) => m.progress === 0)).toBe(true);
  });

  it('wipes the raid if any minion reaches the pool', () => {
    const { imbibe, fight, encounter, run } = setup(choices.rogue!);
    imbibe();
    encounter.minions[0]!.pos = { x: POOL_TARGET.x, y: POOL_TARGET.y + 5 };
    run(0.5);
    expect(fight.raiders.every((c) => !c.alive)).toBe(true);
    fight.update(0);
    expect(fight.status).toBe('wiped');
  });
});

describe('Vashnik: killing the Shrouded Venom', () => {
  /** The player points the raid at a Shrouded Venom by clicking it. */
  const focusShrouded = (s: ReturnType<typeof setup>): void => {
    s.fight.setFocus(s.ofKind('shrouded')[0]!.id);
  };

  it('takes 5 seconds with 6 DPS, and one more second for each DPS that has died', () => {
    for (const [dead, seconds] of [
      [0, SHROUDED_SECONDS],
      [1, SHROUDED_SECONDS + 1],
      [3, SHROUDED_SECONDS + 3],
      [5, SHROUDED_SECONDS + 5],
    ] as const) {
      const s = setup(choices.rogue!);
      s.imbibe();
      s.dpsNpcs()
        .slice(0, dead)
        .forEach((c) => s.fight.kill(c.id));
      focusShrouded(s);
      s.run(seconds - 0.3);
      expect(s.ofKind('shrouded').length, `${dead} dead, before ${seconds}s`).toBe(5);
      s.run(0.6);
      expect(s.ofKind('shrouded').length, `${dead} dead, after ${seconds}s`).toBe(0);
    }
  });

  it('damages all five together, shown on every health ring', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    focusShrouded(s);
    s.run(2.5);
    const progress = s.ofKind('shrouded').map((m) => m.progress);
    expect(progress).toHaveLength(5);
    expect(new Set(progress.map((p) => p.toFixed(3))).size).toBe(1);
    expect(progress[0]).toBeGreaterThan(0.4);
    expect(progress[0]).toBeLessThan(0.6);
  });

  it('does no damage unless the player is attacking them', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(8); // focus stays on the boss
    expect(s.ofKind('shrouded').every((m) => m.progress === 0)).toBe(true);
  });

  it('adds up across interruptions, like switching back to the boss', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    focusShrouded(s);
    s.run(2.5);
    s.fight.setFocus(BOSS_ID);
    s.run(3);
    expect(s.ofKind('shrouded')).toHaveLength(5);
    focusShrouded(s);
    s.run(SHROUDED_SECONDS - 2.5 + 0.2);
    expect(s.ofKind('shrouded')).toHaveLength(0);
  });

  it('has the NPC DPS keep attacking when the player is out of range, a second slower', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.fight.setFocus(s.ofKind('shrouded')[0]!.id);
    s.fight.setInRange(PLAYER_ID, false);
    s.run(SHROUDED_SECONDS + 0.5);
    expect(s.ofKind('shrouded')).toHaveLength(5); // not done yet without the player's help...
    expect(s.ofKind('shrouded')[0]!.progress).toBeGreaterThan(0.8); // ...but well under way
    s.run(1);
    expect(s.ofKind('shrouded')).toHaveLength(0);
  });

  it('puts the focus back on the boss when they die', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    focusShrouded(s);
    s.run(SHROUDED_SECONDS + 0.3);
    expect(s.fight.focusId).toBe(BOSS_ID);
  });

  it('then drops 15 purple circles around the room, none in the pool, that may overlap', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    focusShrouded(s);
    s.run(SHROUDED_SECONDS + 0.3);
    // (Stygian Infection's circles share the list; these are the 15 the Shrouded Venom left.)
    const left = s.encounter.zones.filter((z) => z.id.startsWith('zone-'));
    expect(left).toHaveLength(ZONE_COUNT);
    for (const zone of left) {
      expect(distanceToPolygon(zone.pos, POOL_POLYGON)).toBeGreaterThanOrEqual(ZONE_RADIUS);
      expect(zone.pos.x).toBeGreaterThanOrEqual(ZONE_RADIUS);
      expect(zone.pos.x).toBeLessThanOrEqual(ARENA_WIDTH - ZONE_RADIUS);
    }
  });
});

describe('Vashnik: the purple circles', () => {
  const withZones = () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 9); // let Stygian Infection's own circles finish first
    s.fight.setFocus(s.ofKind('shrouded')[0]!.id);
    s.run(SHROUDED_SECONDS + 0.3);
    return s;
  };

  it('explode after 2 seconds and kill a player standing in one', () => {
    const s = withZones();
    s.state.walking = false;
    const zone = s.encounter.zones[0]!;
    s.context.playerPos.x = zone.pos.x;
    s.context.playerPos.y = zone.pos.y;
    s.run(ZONE_DELAY_SECONDS - 0.5);
    expect(s.fight.player.alive).toBe(true);
    s.run(0.7);
    expect(s.encounter.zones).toHaveLength(0);
    expect(s.fight.player.alive).toBe(false);
  });

  it('spare a player who got out of them', () => {
    const s = withZones();
    s.state.walking = false;
    // Park the player somewhere no circle reaches.
    const clear = { x: 20, y: 20 };
    const spot = [clear, { x: 670, y: 20 }, { x: 20, y: 520 }, { x: 670, y: 520 }].find((p) =>
      s.encounter.zones.every((z) => distance(z.pos, p) > z.radius + 20),
    );
    if (!spot) return; // every corner happened to be covered: nothing to check this time
    s.context.playerPos.x = spot.x;
    s.context.playerPos.y = spot.y;
    s.run(ZONE_DELAY_SECONDS + 0.5);
    expect(s.fight.player.alive).toBe(true);
  });

  it('never hurt NPCs, even ones standing in them', () => {
    const s = withZones();
    for (const zone of s.encounter.zones.slice(0, 3)) {
      s.npcPositions.set(s.fight.npcs[0]!.id, { ...zone.pos });
    }
    s.run(ZONE_DELAY_SECONDS + 0.5);
    expect(s.fight.npcs.every((c) => c.alive)).toBe(true);
  });

  it('make NPC targets steer clear of them, and of the pool', () => {
    const s = withZones();
    const zone = s.encounter.zones[0]!;
    const npc = { id: 'npc-0', role: 'ranged' as const, pos: zone.pos, spot: zone.pos, size: 24 };
    const target = s.encounter.adjustNpcTarget(npc, zone.pos);
    expect(distance(target, zone.pos)).toBeGreaterThanOrEqual(zone.radius + 12 - 0.01);

    const inPool = s.encounter.adjustNpcTarget(
      { ...npc, pos: POOL_TARGET, spot: POOL_TARGET },
      POOL_TARGET,
    );
    expect(pointInPolygon(inPool, POOL_POLYGON)).toBe(false);
  });
});

describe('Vashnik: killing a Burning Venom', () => {
  it('takes 4 seconds with 6 DPS and a second more per dead DPS, and hurts everyone for 25', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    const target = s.ofKind('burning')[0]!;
    s.fight.setFocus(target.id);
    s.run(BURNING_SECONDS - 0.4);
    expect(s.ofKind('burning')).toHaveLength(3);
    // Check on the very frame it dies, before the NPC healers get a chance to heal.
    for (let t = 0; t < 1 && s.ofKind('burning').length === 3; t += 0.05) s.run(0.05);
    expect(s.ofKind('burning')).toHaveLength(2);
    for (const c of s.fight.raiders.filter((r) => r.alive)) {
      expect(c.health).toBe(c.maxHealth - BURNING_DEATH_DAMAGE);
    }
    expect(s.fight.focusId).toBe(BOSS_ID);

    const slower = setup(choices.rogue!);
    slower.imbibe();
    slower.fight.kill(slower.dpsNpcs()[0]!.id);
    slower.fight.setFocus(slower.ofKind('burning')[0]!.id);
    slower.run(BURNING_SECONDS + 0.5);
    expect(slower.ofKind('burning')).toHaveLength(3);
    slower.run(1);
    expect(slower.ofKind('burning')).toHaveLength(2);
  });

  it('does not share damage with the other Burning Venom', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    const [first, second] = s.ofKind('burning');
    s.fight.setFocus(first!.id);
    s.run(2);
    expect(first!.progress).toBeGreaterThan(0.4);
    expect(second!.progress).toBe(0);
  });
});

describe('Vashnik: death grip and banish', () => {
  /** Runs frame by frame until `done` is true (at most 10 seconds). */
  const runUntil = (s: ReturnType<typeof setup>, done: () => boolean): void => {
    for (let t = 0; t < 10 && !done(); t += 0.05) s.run(0.05);
  };
  const anyPulled = (s: ReturnType<typeof setup>): boolean =>
    s.ofKind('burning').some((m) => m.state === 'pulled');

  it('has the NPCs grip two Burning Venom to the tanks and banish the third', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    // Nothing happens at first; the grip comes after GRIP_DELAY_SECONDS.
    expect(s.ofKind('burning').every((m) => m.state === 'walking')).toBe(true);
    runUntil(s, () => anyPulled(s));

    const burning = s.ofKind('burning');
    expect(burning.filter((m) => m.state === 'pulled')).toHaveLength(2);
    expect(burning.filter((m) => m.state === 'banished')).toHaveLength(1);
    // Each of the two is linked to one of the two tanks, by a line.
    const sources = burning.filter((m) => m.state === 'pulled').map((m) => m.pulledBy);
    expect(new Set(sources).size).toBe(2);
    expect(s.encounter.gripLines()).toHaveLength(2);

    // Quickly yanked next to the tanks, after which the lines go away and they walk on.
    s.run(2);
    expect(s.encounter.gripLines()).toHaveLength(0);
    const walking = burning.filter((m) => m.state === 'walking');
    expect(walking).toHaveLength(2);
    for (const m of walking) {
      const nearest = Math.min(...s.context.tanks().map((t) => distance(t.pos, m.pos)));
      expect(nearest).toBeLessThan(80);
    }
  });

  it('does not grip until two seconds after the Burning Venom appear', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(GRIP_DELAY_SECONDS - 0.4);
    expect(s.ofKind('burning').every((m) => m.state === 'walking')).toBe(true);
  });

  it('leaves the banished one frozen until the player focuses it', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    runUntil(s, () => anyPulled(s));
    const banished = s.ofKind('burning').find((m) => m.state === 'banished')!;
    const where = { ...banished.pos };
    s.run(3);
    expect(banished.pos.x).toBeCloseTo(where.x, 0);
    expect(banished.pos.y).toBeCloseTo(where.y, 0);

    s.fight.setFocus(banished.id);
    s.run(1);
    expect(banished.state).toBe('walking');
    expect(distance(banished.pos, POOL_TARGET)).toBeLessThan(distance(where, POOL_TARGET));
  });

  it('makes a Death Knight player do the grip: no automatic grip, and a prompt', () => {
    const s = setup(choices.deathKnight!);
    s.imbibe();
    expect(s.encounter.prompt).toBe(DEATH_GRIP_PROMPT);
    s.run(GRIP_DELAY_SECONDS + 5);
    expect(s.ofKind('burning').every((m) => m.state === 'walking')).toBe(true);
    expect(s.encounter.prompt).toContain(DEATH_GRIP_PROMPT);
  });

  it('pulls the clicked Burning Venom and a random one to the Death Knight, then banishes the third', () => {
    const s = setup(choices.deathKnight!);
    s.state.walking = false; // hold still, so they land beside a steady target
    s.imbibe();
    const clicked = s.ofKind('burning')[0]!;
    expect(s.encounter.playerRightClick(clicked.id)).toBe(true);
    expect(s.ofKind('burning').filter((m) => m.state === 'pulled')).toHaveLength(2);
    expect(clicked.state).toBe('pulled');
    expect(clicked.pulledBy).toBe(PLAYER_ID);
    expect(s.ofKind('burning').filter((m) => m.state === 'banished')).toHaveLength(1);
    expect(s.encounter.prompt).toBeNull();

    // They land beside the player, wherever the player is: range is unlimited.
    s.run(2);
    expect(distance(clicked.pos, s.playerPos)).toBeLessThan(40);
  });

  it('does not let a Death Knight grip Shrouded Venom or grip twice', () => {
    const s = setup(choices.deathKnight!);
    s.imbibe();
    expect(s.encounter.playerRightClick(s.ofKind('shrouded')[0]!.id)).toBe(false);
    expect(s.encounter.playerRightClick(s.ofKind('burning')[0]!.id)).toBe(true);
    expect(s.encounter.playerRightClick(s.ofKind('burning')[1]!.id)).toBe(false);
  });

  it('has NPCs grip as normal for a Warlock player, then prompts them to banish the third by hand', () => {
    const s = setup(choices.warlock!);
    s.imbibe();
    expect(s.encounter.prompt).toBeNull();
    runUntil(s, () => anyPulled(s));
    const burning = s.ofKind('burning');
    expect(burning.filter((m) => m.state === 'pulled')).toHaveLength(2);
    expect(burning.filter((m) => m.state === 'banished')).toHaveLength(0);
    s.run(0.05);
    expect(s.encounter.prompt).toBe(BANISH_PROMPT);
  });

  it('lets a Warlock banish only the third one, which keeps walking until then', () => {
    const s = setup(choices.warlock!);
    s.imbibe();
    runUntil(s, () => anyPulled(s));
    const burning = s.ofKind('burning');
    const gripped = burning.filter((m) => m.state === 'pulled');
    const third = burning.find((m) => !gripped.includes(m))!;

    const before = { ...third.pos };
    s.run(2);
    expect(distance(third.pos, before)).toBeGreaterThan(MINION_SPEED); // still walking

    expect(s.encounter.playerRightClick(gripped[0]!.id)).toBe(false);
    expect(s.encounter.playerRightClick(third.id)).toBe(true);
    expect(third.state).toBe('banished');
    expect(s.encounter.prompt ?? '').not.toContain(BANISH_PROMPT);
  });

  it('ignores right-clicks from other classes', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    expect(s.encounter.playerRightClick(s.ofKind('burning')[0]!.id)).toBe(false);
  });
});

describe('Vashnik: where NPC DPS go', () => {
  it('head for the minion the player is focusing, but tanks and healers stay put', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    const minion = s.ofKind('shrouded')[0]!;
    const far = { x: 345, y: 300 };
    const dps = { id: 'npc-3', role: 'melee' as const, pos: far, spot: far, size: 24 };
    const tank = { id: 'npc-0', role: 'tank' as const, pos: far, spot: far, size: 24 };

    // Before anything is focused they simply head to their spot.
    expect(s.encounter.adjustNpcTarget(dps, far)).toEqual(far);

    s.fight.setFocus(minion.id);
    const goal = s.encounter.adjustNpcTarget(dps, far);
    expect(distance(goal, minion.pos)).toBeLessThan(distance(far, minion.pos));
    expect(s.encounter.adjustNpcTarget(tank, far)).toEqual(far);
  });

  it('hold still once they are close enough to attack', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    const minion = s.ofKind('shrouded')[0]!;
    s.fight.setFocus(minion.id);
    const near = { x: minion.pos.x + 30, y: minion.pos.y };
    const dps = {
      id: 'npc-3',
      role: 'melee' as const,
      pos: near,
      spot: { x: 100, y: 100 },
      size: 24,
    };
    expect(s.encounter.adjustNpcTarget(dps, dps.spot)).toEqual(near);
  });
});

describe('Vashnik: a healer player', () => {
  it('has the raid focus the Shrouded Venom, then the Burning Venom, then the boss, with no clicks', () => {
    const s = setup(choices.healer!);
    s.imbibe();
    s.run(0.1);
    expect(s.fight.focusId.startsWith('shrouded')).toBe(true);

    // The Shrouded Venom die first, as if the player had clicked them.
    s.run(SHROUDED_SECONDS + 0.3);
    expect(s.ofKind('shrouded')).toHaveLength(0);
    expect(s.fight.focusId.startsWith('burning')).toBe(true);

    // Then the Burning Venom, one at a time, until none are left.
    for (let t = 0; t < 30 && s.ofKind('burning').length > 0; t += 0.05) s.run(0.05);
    expect(s.ofKind('burning')).toHaveLength(0);
    expect(s.fight.focusId).toBe(BOSS_ID);
  });

  it('goes for the Burning Venom nearest the pool first and leaves the banished one for last', () => {
    const s = setup(choices.healer!);
    s.imbibe();
    // Get the Shrouded Venom out of the way, and the grip and banish done.
    for (let t = 0; t < 10 && s.ofKind('shrouded').length > 0; t += 0.05) s.run(0.05);
    const burning = s.ofKind('burning');
    const banished = burning.find((m) => m.state === 'banished')!;
    expect(banished).toBeDefined();
    s.run(0.1); // the raid picks its next target a moment after the last one dies
    expect(s.fight.focusId).not.toBe(banished.id);
    expect(s.fight.focusId.startsWith('burning')).toBe(true);

    const first = s.fight.focusId;
    s.run(1);
    expect(s.fight.focusId).toBe(first); // it sticks with one until it dies
    const nearest = burning
      .filter((m) => m !== banished)
      .reduce((a, b) => (distance(a.pos, POOL_TARGET) <= distance(b.pos, POOL_TARGET) ? a : b));
    expect(first).toBe(nearest.id);
  });

  it('ignores the healer\x27s own clicks on minions, since the raid is already choosing', () => {
    const s = setup(choices.healer!);
    s.imbibe();
    s.run(0.1);
    const before = s.fight.focusId;
    // Nothing a healer does changes it: the encounter keeps the priority order.
    s.fight.setFocus(BOSS_ID);
    s.run(0.1);
    expect(s.fight.focusId).toBe(before);
  });
});

describe('Vashnik: Stygian Infection', () => {
  /** Circles dropped by the infection that exist right now. */
  const infectionZones = (s: ReturnType<typeof setup>) =>
    s.encounter.zones.filter((z) => z.id.startsWith('infection-'));

  it('drops a purple circle under the player every second for 6 seconds', () => {
    const s = setup(choices.rogue!);
    s.imbibe(); // 0.1 seconds after Imbibe
    expect(infectionZones(s)).toHaveLength(0);

    const seen = new Set<string>();
    for (let t = 0; t < STYGIAN_INFECTION_DELAY_SECONDS + 8; t += 0.05) {
      s.run(0.05);
      for (const z of infectionZones(s)) seen.add(z.id);
    }
    expect([...seen]).toHaveLength(6);
  });

  it('puts each circle where the player is standing when it drops', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.playerPos.x = 500;
    s.playerPos.y = 300;
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 1);
    const zone = infectionZones(s)[0]!;
    expect(zone).toBeDefined();
    expect(zone.pos).toEqual({ x: 500, y: 300 });
    expect(zone.radius).toBe(ZONE_RADIUS);
    expect(zone.timeLeft).toBeLessThanOrEqual(ZONE_DELAY_SECONDS);
  });

  it('kills a player who stands still, when the first circle explodes after 2 seconds', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 2.5); // the first circle drops 1 second in and explodes at 3
    expect(s.fight.player.alive).toBe(true);
    s.run(1);
    expect(s.fight.player.alive).toBe(false);
  });

  it('spares a player who keeps moving', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 9);
    expect(s.fight.player.alive).toBe(true);
  });

  it('only drops circles for the player, and stops once the infection is over', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 10);
    expect(s.encounter.zones).toHaveLength(0);
    expect(s.fight.npcs.every((c) => c.alive)).toBe(true);
  });

  it('makes NPCs avoid the circles the player drops', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.playerPos.x = 500;
    s.playerPos.y = 300;
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 1);
    const spot = { x: 500, y: 300 };
    const npc = { id: 'npc-3', role: 'ranged' as const, pos: spot, spot, size: 24 };
    const goal = s.encounter.adjustNpcTarget(npc, spot);
    expect(distance(goal, spot)).toBeGreaterThanOrEqual(ZONE_RADIUS + 12 - 0.01);
  });
});

describe('Vashnik: Exploding Infection (healer players)', () => {
  /** A healer fight with the NPC healer out of the way, so only the player can dispel. */
  const healerFight = () => {
    const s = setup(choices.healer!);
    s.fight.kill(s.fight.npcs.find((c) => c.role === 'healer')!.id);
    return s;
  };

  it('afflicts every raider with Exploding Infection, to be dispelled', () => {
    const s = healerFight();
    s.imbibeWithMagic();
    for (const raider of s.fight.raiders.filter((r) => r.alive)) {
      expect(raider.debuffed, raider.id).toBe(true);
    }
  });

  it('does nothing of the kind for a player who is not a healer', () => {
    const s = setup(choices.rogue!);
    s.imbibeWithMagic();
    expect(s.fight.raiders.some((r) => r.debuffed)).toBe(false);
  });

  it('deals 20 damage a second to everyone who still has it', () => {
    const s = healerFight();
    s.imbibeWithMagic();
    s.run(1);
    for (const raider of s.fight.raiders.filter((r) => r.alive)) {
      expect(raider.health, raider.id).toBe(raider.maxHealth - EXPLODING_INFECTION_DAMAGE);
    }
    s.run(1);
    for (const raider of s.fight.raiders.filter((r) => r.alive)) {
      expect(raider.health, raider.id).toBe(raider.maxHealth - EXPLODING_INFECTION_DAMAGE * 2);
    }
  });

  it('stops hurting someone the moment they are dispelled', () => {
    const s = healerFight();
    s.imbibeWithMagic();
    s.run(1);
    expect(s.fight.tryPlayerDispel(PLAYER_ID)).toBe(true); // the healer dispels themselves
    expect(s.fight.player.debuffed).toBe(false);
    s.run(2);
    expect(s.fight.player.health).toBe(s.fight.player.maxHealth - EXPLODING_INFECTION_DAMAGE); // only the first tick
    const other = s.fight.npcs.find((c) => c.role === 'melee')!;
    expect(other.health).toBe(other.maxHealth - EXPLODING_INFECTION_DAMAGE * 3);
  });

  it('kills a 100 health raider after five ticks, but not a 200 health tank', () => {
    const s = healerFight();
    s.imbibeWithMagic();
    const melee = s.fight.npcs.find((c) => c.role === 'melee')!;
    const tank = s.fight.npcs.find((c) => c.role === 'tank')!;
    s.run(4.2); // four ticks: 80 damage, so a 100 health raider has 20 left
    expect(melee.alive).toBe(true);
    s.run(1);
    expect(melee.alive).toBe(false);
    expect(tank.alive).toBe(true);
  });
});

describe('Vashnik: the Imbibe timeline', () => {
  /** Runs until Vashnik has started to imbibe, and no further. */
  const startImbibe = (s: ReturnType<typeof setup>): void => {
    s.encounter.triggerImbibe();
    s.run(0.1);
  };

  it('holds the minions back for 3 seconds after Vashnik starts to imbibe', () => {
    const s = setup(choices.rogue!);
    startImbibe(s);
    expect(s.encounter.minions).toHaveLength(0);
    s.run(MINION_SPAWN_DELAY_SECONDS - 0.5);
    expect(s.encounter.minions).toHaveLength(0);
    s.run(0.6);
    expect(s.encounter.minions).toHaveLength(SHROUDED_VENOM_COUNT + BURNING_VENOM_COUNT);
  });

  it('tells a DPS player to left click the adds while they wait, and then stops', () => {
    const s = setup(choices.rogue!);
    expect(s.encounter.prompt).toBeNull();
    startImbibe(s);
    expect(s.encounter.prompt).toBe(FOCUS_PROMPT);
    s.run(MINION_SPAWN_DELAY_SECONDS);
    expect(s.encounter.prompt).toBeNull();
  });

  it('does not show a healer that prompt, since their raid picks targets itself', () => {
    const s = setup(choices.healer!);
    startImbibe(s);
    expect(s.encounter.prompt).toBeNull();
  });

  it('puts Exploding Infection out when the minions appear, not before', () => {
    const s = setup(choices.healer!);
    startImbibe(s);
    expect(s.fight.raiders.some((r) => r.debuffed)).toBe(false);
    // Look on the very frame the minions appear, before the NPC healer starts dispelling.
    for (let t = 0; t < 5 && s.encounter.minions.length === 0; t += 0.05) s.run(0.05);
    expect(s.encounter.minions.length).toBeGreaterThan(0);
    expect(s.fight.raiders.every((r) => !r.alive || r.debuffed)).toBe(true);
  });

  it('shows a healer to dispel while anyone still has it, then stops', () => {
    const s = setup(choices.healer!);
    s.imbibeWithMagic();
    expect(s.encounter.prompt).toContain(DISPEL_PROMPT);
    for (const raider of s.fight.raiders) s.fight.dispel(raider.id);
    s.run(0.1);
    expect(s.encounter.prompt ?? '').not.toContain(DISPEL_PROMPT);
  });

  it('shows the Death Knight and Warlock instructions only once the minions are out', () => {
    const dk = setup(choices.deathKnight!);
    startImbibe(dk);
    expect(dk.encounter.prompt ?? '').not.toContain(DEATH_GRIP_PROMPT);
    dk.run(MINION_SPAWN_DELAY_SECONDS);
    expect(dk.encounter.prompt).toContain(DEATH_GRIP_PROMPT);
  });

  it('waits 4 seconds after the minions appear before Stygian Infection goes out', () => {
    const s = setup(choices.rogue!);
    s.imbibe(); // just after the minions appear
    s.run(STYGIAN_INFECTION_DELAY_SECONDS - 0.5);
    expect(s.encounter.zones).toHaveLength(0);
    expect(s.encounter.prompt ?? '').not.toContain(STYGIAN_PROMPT);

    // It starts, with its instruction, and the first circle drops a second later.
    s.run(0.6);
    expect(s.encounter.prompt).toContain(STYGIAN_PROMPT);
    expect(s.encounter.zones).toHaveLength(0);
    s.run(1);
    expect(s.encounter.zones.some((z) => z.id.startsWith('infection-'))).toBe(true);
  });

  it('keeps the dodge instruction up until the last circle has exploded, then removes it', () => {
    const s = setup(choices.rogue!);
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 6.5); // all six dropped, the last still waiting
    expect(s.encounter.prompt).toContain(STYGIAN_PROMPT);
    s.run(3);
    expect(s.encounter.prompt ?? '').not.toContain(STYGIAN_PROMPT);
  });

  it('stacks instructions that apply at the same time, one per line', () => {
    const s = setup(choices.deathKnight!);
    s.imbibe();
    s.run(STYGIAN_INFECTION_DELAY_SECONDS + 0.6);
    expect(s.encounter.prompt).toBe(`${DEATH_GRIP_PROMPT}\n${STYGIAN_PROMPT}`);
  });
});

describe('Vashnik: Catalytic Bile', () => {
  const WARNING = CATALYTIC_BILE_WARNING_SECONDS;
  const DURATION = CATALYTIC_BILE_DURATION_SECONDS;

  /** A fight where the bile is started by hand, straight away, with the player held still. */
  const startBile = (seed = 7) => {
    const s = setup(choices.rogue!, undefined, seed);
    s.state.walking = false;
    s.run(0.1); // let the encounter see the fight
    s.encounter.triggerCatalyticBile();
    return s;
  };
  /** Runs until the green circle appears. */
  const untilCircle = (s: ReturnType<typeof setup>): void => {
    for (let t = 0; t < WARNING + 1 && !s.encounter.bile; t += 0.05) s.run(0.05);
  };

  it('shows the instruction 2 seconds before the circle, and keeps it until its time is done', () => {
    const s = startBile();
    expect(s.encounter.prompt).toContain(CATALYTIC_BILE_PROMPT);
    expect(s.encounter.bile).toBeNull();

    s.run(WARNING - 0.3);
    expect(s.encounter.bile).toBeNull(); // still only a warning

    untilCircle(s);
    expect(s.encounter.bile).not.toBeNull();
    expect(s.encounter.prompt).toContain(CATALYTIC_BILE_PROMPT);

    s.context.playerPos.x = s.encounter.bile!.pos.x; // stand in it, so the fight carries on
    s.context.playerPos.y = s.encounter.bile!.pos.y;
    s.run(DURATION - 0.5);
    expect(s.encounter.prompt).toContain(CATALYTIC_BILE_PROMPT);
    s.run(0.7);
    expect(s.encounter.bile).toBeNull();
    expect(s.encounter.prompt ?? '').not.toContain(CATALYTIC_BILE_PROMPT);
  });

  it('puts the circle in the lower two thirds of the arena, clear of the acid pool', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = startBile(seed);
      untilCircle(s);
      const { pos, radius } = s.encounter.bile!;
      expect(radius).toBe(CATALYTIC_BILE_RADIUS);
      expect(pos.y - radius).toBeGreaterThanOrEqual(ARENA_HEIGHT / 3 - 0.001);
      expect(pos.y + radius).toBeLessThanOrEqual(ARENA_HEIGHT + 0.001);
      expect(pos.x - radius).toBeGreaterThanOrEqual(-0.001);
      expect(pos.x + radius).toBeLessThanOrEqual(ARENA_WIDTH + 0.001);
      expect(distanceToPolygon(pos, POOL_POLYGON)).toBeGreaterThanOrEqual(radius);
    }
  });

  it('avoids appearing on top of NPC raiders', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = setup(choices.rogue!, undefined, seed);
      s.state.walking = false;
      // The NPCs fill the left and middle of the room, leaving the right side open.
      s.fight.npcs.forEach((c, i) => {
        s.npcPositions.set(c.id, { x: 80 + (i % 3) * 120, y: 250 + Math.floor(i / 3) * 100 });
      });
      s.run(0.1);
      s.encounter.triggerCatalyticBile();
      untilCircle(s);
      const { pos, radius } = s.encounter.bile!;
      for (const npcPos of s.npcPositions.values()) {
        expect(distance(npcPos, pos)).toBeGreaterThanOrEqual(radius + 12);
      }
    }
  });

  it('kills the whole raid if the player is not standing in it when the time is up', () => {
    const s = startBile();
    untilCircle(s);
    const { pos } = s.encounter.bile!;
    s.context.playerPos.x = pos.x + CATALYTIC_BILE_RADIUS + 60;
    s.context.playerPos.y = pos.y;
    s.run(DURATION - 0.3);
    expect(s.fight.raiders.every((r) => r.alive)).toBe(true);
    s.run(0.5);
    expect(s.fight.raiders.every((r) => !r.alive)).toBe(true);
    s.fight.update(0);
    expect(s.fight.status).toBe('wiped');
  });

  it('spares everyone if the player is standing in it', () => {
    const s = startBile();
    untilCircle(s);
    const { pos } = s.encounter.bile!;
    s.context.playerPos.x = pos.x + CATALYTIC_BILE_RADIUS - 5;
    s.context.playerPos.y = pos.y;
    s.run(DURATION + 0.5);
    expect(s.encounter.bile).toBeNull();
    expect(s.fight.player.alive).toBe(true);
    expect(s.fight.npcs.every((c) => c.alive)).toBe(true);
    expect(s.fight.status).toBe('active');
  });

  it('has NPCs step out of the circle while it is out, and not before', () => {
    const s = startBile();
    const npc = {
      id: 'npc-3',
      role: 'ranged' as const,
      pos: { x: 0, y: 0 },
      spot: { x: 0, y: 0 },
      size: 24,
    };
    untilCircle(s);
    const { pos, radius } = s.encounter.bile!;
    const goal = s.encounter.adjustNpcTarget({ ...npc, pos, spot: pos }, pos);
    expect(distance(goal, pos)).toBeGreaterThanOrEqual(radius + 12 - 0.01);

    s.context.playerPos.x = pos.x;
    s.context.playerPos.y = pos.y;
    s.run(DURATION + 0.5);
    expect(s.encounter.adjustNpcTarget({ ...npc, pos, spot: pos }, pos)).toEqual(pos);
  });
});

describe('Vashnik: Plague Froth', () => {
  const DELAY = PLAGUE_FROTH_DELAY_SECONDS;

  /** A fight with Plague Froth started by hand, the player held still in open ground. */
  const startFroth = (seed = 7, choice = choices.rogue!) => {
    const s = setup(choice, undefined, seed);
    s.state.walking = false;
    s.run(0.1);
    s.encounter.triggerPlagueFroth();
    return s;
  };

  it('marks five raiders, always including the player and never a tank', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = startFroth(seed);
      const ids = s.encounter.frothTargets.map((t) => t.id);
      expect(ids).toHaveLength(PLAGUE_FROTH_TARGET_COUNT);
      expect(ids).toContain(PLAYER_ID);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(s.fight.npcs.find((c) => c.id === id)?.role).not.toBe('tank');
      }
    }
  });

  it('shoots a circle along each of four diagonals after the delay, not before', () => {
    const s = startFroth();
    s.run(DELAY - 0.3);
    expect(s.encounter.frothBalls).toHaveLength(0);
    s.run(0.5);
    const balls = s.encounter.frothBalls;
    expect(balls).toHaveLength(PLAGUE_FROTH_TARGET_COUNT * 4);
    expect(s.encounter.frothTargets).toHaveLength(0);
    const mine = balls.filter((b) => b.sourceId === PLAYER_ID);
    const signs = mine.map((b) => [Math.sign(b.velocity.x), Math.sign(b.velocity.y)].join());
    expect(new Set(signs).size).toBe(4);
    expect(mine[0]!.radius).toBe(s.context.npcRadius);
  });

  it('removes the circles once they are off the arena', () => {
    const s = startFroth();
    s.fight.npcs.forEach((c, i) => s.npcPositions.set(c.id, { x: 20 + i * 5, y: 20 + i * 40 }));
    s.playerPos.x = 600;
    s.playerPos.y = 500;
    s.run(DELAY + 0.5);
    expect(s.encounter.frothBalls.length).toBeGreaterThan(0);
    s.run(10);
    expect(s.encounter.frothBalls).toHaveLength(0);
  });

  it('kills the player when a circle from an NPC hits them', () => {
    const s = startFroth();
    // Put the marked NPCs well away and the player on the line of one NPC.
    const npc = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!;
    s.npcPositions.set(npc.id, { x: 500, y: 300 });
    s.playerPos.x = 500 + 100;
    s.playerPos.y = 300 + 100; // straight down-right of that NPC
    s.run(DELAY + 2);
    expect(s.fight.player.alive).toBe(false);
  });

  it('does not kill the player with their own circles', () => {
    const s = startFroth();
    // Everyone else far from the player, nobody in line with them.
    s.fight.npcs.forEach((c, i) => s.npcPositions.set(c.id, { x: 20 + i * 5, y: 20 + i * 40 }));
    s.playerPos.x = 600;
    s.playerPos.y = 500;
    s.run(DELAY + 3);
    expect(s.fight.player.alive).toBe(true);
  });

  it('does not kill an NPC hit by a circle the player shot', () => {
    const s = startFroth();
    s.fight.npcs.forEach((c, i) => s.npcPositions.set(c.id, { x: 20 + i * 5, y: 20 + i * 40 }));
    s.playerPos.x = 300;
    s.playerPos.y = 300;
    const victim = s.fight.npcs.find(
      (c) => c.role !== 'tank' && !s.encounter.frothTargets.some((t) => t.id === c.id),
    )!;
    s.npcPositions.set(victim.id, { x: 300 + 100, y: 300 - 100 }); // up-right of the player
    s.run(DELAY + 2);
    expect(victim.alive).toBe(true);
  });

  it('does not let circles from NPCs kill other NPCs', () => {
    const s = startFroth();
    const npcTarget = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!;
    s.fight.npcs.forEach((c, i) => s.npcPositions.set(c.id, { x: 20 + i * 5, y: 20 + i * 40 }));
    s.playerPos.x = 600;
    s.playerPos.y = 500;
    const bystander = s.fight.npcs.find((c) => c.id !== npcTarget.id)!;
    s.npcPositions.set(npcTarget.id, { x: 300, y: 300 });
    s.npcPositions.set(bystander.id, { x: 400, y: 400 }); // straight down-right of the marked NPC
    s.run(DELAY + 2);
    expect(bystander.alive).toBe(true);
  });

  it('has marked NPCs spread away from the others, and only while marked', () => {
    const s = startFroth();
    const marked = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!;
    const npc = {
      id: marked.id,
      role: 'ranged' as const,
      pos: { x: 100, y: 450 },
      spot: { x: 100, y: 450 },
      size: 24,
    };
    const others = s.fight.npcs.filter((c) => c.id !== marked.id);
    others.forEach((c) => s.npcPositions.set(c.id, { x: 100, y: 450 }));
    const goal = s.encounter.adjustNpcTarget(npc, npc.spot);
    expect(distance(goal, { x: 100, y: 450 })).toBeGreaterThan(40);

    s.run(DELAY + 0.5);
    expect(s.encounter.adjustNpcTarget(npc, npc.spot)).toEqual(npc.spot);
  });
});

describe('Vashnik: Malignant Totems', () => {
  const imbibeNow = (s: ReturnType<typeof setup>): void => {
    (s.encounter as unknown as { imbibe(): void }).imbibe();
  };

  it('puts eight totems in the lower two thirds, clear of the pool, six seconds after Imbibe', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = setup(choices.rogue!, undefined, seed);
      s.state.walking = false;
      s.run(0.1);
      imbibeNow(s);
      s.run(MALIGNANT_TOTEM_DELAY_SECONDS - 0.3);
      expect(s.encounter.totems).toHaveLength(0);
      s.run(0.5);
      expect(s.encounter.totems).toHaveLength(MALIGNANT_TOTEM_COUNT);
      for (const t of s.encounter.totems) {
        expect(t.radius).toBe(s.context.npcRadius * MALIGNANT_TOTEM_SIZE_FACTOR);
        expect(t.pos.y - t.radius).toBeGreaterThanOrEqual(ARENA_HEIGHT / 3 - 0.001);
        expect(t.pos.x - t.radius).toBeGreaterThanOrEqual(-0.001);
        expect(t.pos.x + t.radius).toBeLessThanOrEqual(ARENA_WIDTH + 0.001);
        expect(t.pos.y + t.radius).toBeLessThanOrEqual(ARENA_HEIGHT + 0.001);
        expect(distanceToPolygon(t.pos, POOL_POLYGON)).toBeGreaterThanOrEqual(t.radius);
      }
    }
  });

  it('does not announce the totems', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.run(0.1);
    imbibeNow(s);
    s.run(MALIGNANT_TOTEM_DELAY_SECONDS + 0.5);
    expect(s.encounter.prompt ?? '').not.toMatch(/totem/i);
  });

  it('wipes the raid if Vashnik imbibes while totems are still up', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.run(0.1);
    imbibeNow(s);
    s.run(MALIGNANT_TOTEM_DELAY_SECONDS + 0.5);
    expect(s.fight.player.alive).toBe(true);
    imbibeNow(s);
    expect(s.fight.raiders.every((r) => !r.alive)).toBe(true);
  });

  it('does not wipe the raid on Imbibe if the totems are gone', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.run(0.1);
    imbibeNow(s);
    s.run(MALIGNANT_TOTEM_DELAY_SECONDS + 0.5);
    s.encounter.totems = [];
    imbibeNow(s);
    expect(s.fight.player.alive).toBe(true);
  });

  it('destroys a totem hit by a Plague Froth circle, and only that one', () => {
    const s = setup(choices.rogue!);
    s.state.walking = false;
    s.run(0.1);
    imbibeNow(s);
    s.run(MALIGNANT_TOTEM_DELAY_SECONDS + 0.5);
    const [hit, ...rest] = s.encounter.totems;
    s.encounter.frothBalls.push({
      pos: { x: hit!.pos.x - 4, y: hit!.pos.y },
      velocity: { x: 0, y: 0 },
      radius: s.context.npcRadius,
      sourceId: s.fight.npcs[3]!.id,
    });
    s.run(0.1);
    expect(s.encounter.totems.map((t) => t.id)).toEqual(rest.map((t) => t.id));
  });

  it('keeps the purple circles from dying Shrouded Venom in the lower two thirds', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = setup(choices.rogue!, undefined, seed);
      s.state.walking = false;
      s.imbibe();
      (s.encounter as unknown as { spawnZones(): void }).spawnZones();
      expect(s.encounter.zones.length).toBeGreaterThan(0);
      for (const z of s.encounter.zones) {
        expect(z.pos.y - z.radius).toBeGreaterThanOrEqual(ARENA_HEIGHT / 3 - 0.001);
      }
    }
  });
});

describe('Vashnik: the order of the fight', () => {
  /** Where the player stands, out of the way of everything the NPCs do in these tests. */
  const SAFE_SPOT = { x: 660, y: 200 };
  const NPC_SIZE = 24;

  /**
   * A scripted fight with every NPC standing still: the tanks just below Vashnik, everyone else in
   * a column at the left edge. The player is held still, well clear of the NPCs' plague waves.
   */
  const scripted = (classChoice = choices.rogue!, seed = 7) => {
    const s = setup(classChoice, undefined, seed, true);
    s.state.walking = false;
    s.context.bossPos = { ...BOSS_DESTINATION };
    let tank = 0;
    s.fight.npcs.forEach((c, i) => {
      if (c.role === 'tank') {
        s.npcPositions.set(c.id, {
          x: BOSS_DESTINATION.x + (tank++ === 0 ? -10 : 10),
          y: BOSS_DESTINATION.y + 39,
        });
      } else {
        s.npcPositions.set(c.id, { x: 20, y: 60 + i * 50 });
      }
    });
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;
    return s;
  };
  type Scripted = ReturnType<typeof scripted>;

  /** Runs on, clearing Stygian Infection's circles as they appear (the player is not moving). */
  const runSafe = (s: Scripted, seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) {
      s.run(0.05);
      s.encounter.zones = [];
    }
  };
  const runUntil = (s: Scripted, done: () => boolean, max = 60): void => {
    for (let t = 0; t < max && !done(); t += 0.05) runSafe(s, 0.05);
    expect(done()).toBe(true);
  };
  const frothOver = (s: Scripted): boolean =>
    s.encounter.frothTargets.length === 0 && s.encounter.frothBalls.length === 0;
  const kill = (s: Scripted, minion: Minion): void => {
    (s.encounter as unknown as { killBurning(m: Minion): void }).killBurning(minion);
  };
  const npcInfo = (s: Scripted, id: string) => {
    const pos = s.npcPositions.get(id)!;
    return { id, role: s.fight.get(id).role!, pos, spot: pos, size: NPC_SIZE };
  };

  /** Plays the fight up to Imbibe, then kills two Burning Venom, which brings out the bile. */
  const toSecondBurning = (s: Scripted) => {
    runSafe(s, FIRST_FROTH_SECONDS + 0.2);
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS + MINION_SPAWN_DELAY_SECONDS + GRIP_DELAY_SECONDS + 0.5);
    const burning = s.ofKind('burning');
    const third = burning.find((m) => m.state === 'banished')!;
    const first = burning.filter((m) => m !== third);
    kill(s, first[0]!);
    runSafe(s, 0.1);
    return { third, last: first[1]! };
  };

  it('does the first Plague Froth 5 seconds into the fight, with its instruction', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS - 0.3);
    expect(s.encounter.frothTargets).toHaveLength(0);
    expect(s.encounter.prompt ?? '').not.toContain(FROTH_AIM_PROMPT);
    runSafe(s, 0.5);
    expect(s.encounter.frothTargets).toHaveLength(PLAGUE_FROTH_TARGET_COUNT);
    expect(s.encounter.prompt).toBe(FROTH_AIM_PROMPT);
  });

  it('keeps the first instruction up until its circles are gone, and then does nothing more with it', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS + PLAGUE_FROTH_DELAY_SECONDS + 0.3);
    expect(s.encounter.frothBalls.length).toBeGreaterThan(0);
    expect(s.encounter.prompt).toContain(FROTH_AIM_PROMPT);
    runUntil(s, () => frothOver(s));
    runSafe(s, 0.1);
    expect(s.encounter.prompt ?? '').not.toContain(FROTH_AIM_PROMPT);
    expect(s.encounter.totems).toHaveLength(0);
    expect(s.bossMoves).toHaveLength(0);
  });

  it('starts the circles 3 meters from each raider, along the diagonals', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS + 0.2);
    const marked = s.encounter.frothTargets.map((t) => ({ id: t.id, pos: { ...t.pos } }));
    runUntil(s, () => s.encounter.frothBalls.length > 0);
    for (const { id, pos } of marked) {
      const mine = s.encounter.frothBalls.filter((b) => b.sourceId === id);
      expect(mine).toHaveLength(4);
      for (const ball of mine) {
        // A frame of travel, at most, beyond the 3 meters.
        expect(distance(ball.pos, pos)).toBeGreaterThanOrEqual(PLAGUE_FROTH_START_DISTANCE - 0.01);
        expect(distance(ball.pos, pos)).toBeLessThan(PLAGUE_FROTH_START_DISTANCE + 10);
      }
    }
  });

  it('lets a raider standing on a marked one survive its circles', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS + 0.2);
    // Put the player right on top of a marked NPC.
    const npc = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!;
    s.playerPos.x = npc.pos.x;
    s.playerPos.y = npc.pos.y;
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 4);
    expect(s.fight.player.alive).toBe(true);
  });

  it('imbibes 5 seconds after the first circles are gone', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS + PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS - 0.5);
    expect(s.encounter.prompt ?? '').not.toContain(FOCUS_PROMPT);
    runSafe(s, 0.7);
    expect(s.encounter.prompt).toContain(FOCUS_PROMPT);
    runSafe(s, MINION_SPAWN_DELAY_SECONDS);
    expect(s.encounter.minions).toHaveLength(SHROUDED_VENOM_COUNT + BURNING_VENOM_COUNT);
  });

  it('brings out the bile when the second Burning Venom dies, and frees the last one', () => {
    const s = scripted();
    runSafe(s, FIRST_FROTH_SECONDS + PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS + MINION_SPAWN_DELAY_SECONDS + GRIP_DELAY_SECONDS + 0.5);
    const burning = s.ofKind('burning');
    const third = burning.find((m) => m.state === 'banished')!;
    expect(third).toBeDefined();
    const [first, second] = burning.filter((m) => m !== third);

    kill(s, first!);
    runSafe(s, 0.2);
    expect(s.encounter.prompt ?? '').not.toContain(CATALYTIC_BILE_PROMPT);
    expect(third.state).toBe('banished');
    expect(s.bossMoves).toHaveLength(0);

    kill(s, second!);
    runSafe(s, 0.2);
    expect(s.encounter.prompt).toContain(CATALYTIC_BILE_PROMPT);
    expect(third.state).toBe('walking');
    expect(s.encounter.markersVisible).toBe(true);
  });

  it('lays the markers out in order along a line leaning left from the pool corner', () => {
    const s = scripted();
    expect(s.encounter.markers.map((m) => m.id)).toEqual([
      'cross',
      'triangle',
      'diamond',
      'star',
      'moon',
    ]);
    const m = s.encounter.markers;
    const gaps = m.slice(1).map((p, i) => distance(p.pos, m[i]!.pos));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!);
    for (let i = 1; i < m.length; i++) {
      expect(m[i]!.pos.y).toBeGreaterThan(m[i - 1]!.pos.y);
      expect(m[i]!.pos.x).toBeLessThan(m[i - 1]!.pos.x); // leaning left
    }
    expect(m[0]!.pos.y).toBeGreaterThan(Math.max(...POOL_POLYGON.map((p) => p.y)));
    expect(m[4]!.pos.y).toBeLessThan(ARENA_HEIGHT);
  });

  it('has the tanks stand between the diamond and the star, with Vashnik to their right', () => {
    const s = scripted();
    const { last } = toSecondBurning(s);
    kill(s, last);
    runSafe(s, 0.2);
    expect(s.bossMoves).toHaveLength(1);
    expect(s.bossMoves[0]!.x).toBeCloseTo(MARKER_TANK_SPOT.x + MARKER_BOSS_OFFSET, 0);
    expect(s.bossMoves[0]!.y).toBeCloseTo(MARKER_TANK_SPOT.y, 0);

    // Everyone, the tanks included, is sent to stack on the spot between the markers. (The player
    // is the only one who is not.)
    for (const npc of s.fight.npcs) {
      const info = npcInfo(s, npc.id);
      const goal = s.encounter.adjustNpcTarget(info, info.pos);
      expect(goal.x).toBeCloseTo(MARKER_TANK_SPOT.x, 0);
      expect(goal.y).toBeCloseTo(MARKER_TANK_SPOT.y, 0);
      expect(goal.x).toBeLessThan(s.bossMoves[0]!.x); // left of Vashnik
    }
  });

  /** The fight at the moment the last Burning Venom has died and the even Plague Froth has begun. */
  const toMarkerFroth = (seed = 7) => {
    const s = scripted(choices.rogue!, seed);
    runSafe(s, FIRST_FROTH_SECONDS + PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS + MINION_SPAWN_DELAY_SECONDS + GRIP_DELAY_SECONDS + 0.5);
    const burning = s.ofKind('burning');
    const third = burning.find((m) => m.state === 'banished')!;
    const others = burning.filter((m) => m !== third);
    kill(s, others[0]!);
    runSafe(s, 0.1);
    kill(s, others[1]!);
    runSafe(s, 0.1);
    // Stand in the bile when it appears, so the raid lives.
    runUntil(s, () => s.encounter.bile !== null);
    s.playerPos.x = s.encounter.bile!.pos.x;
    s.playerPos.y = s.encounter.bile!.pos.y;
    runUntil(s, () => s.encounter.bile === null);
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;
    expect(s.fight.status).toBe('active');
    kill(s, third);
    s.encounter.minions = []; // the Shrouded Venom are dealt with too, so none reach the pool
    runSafe(s, 0.1);
    // The tanks have taken Vashnik to the markers (out of the way of the circles, in this test),
    // the marked NPCs walk to their markers, and the rest stack on the tanks.
    let tankNumber = 0;
    for (const npc of s.fight.npcs) {
      if (npc.role === 'tank') s.npcPositions.set(npc.id, { x: 630 + 20 * tankNumber++, y: 420 });
    }
    for (const npc of s.fight.npcs) {
      if (npc.role === 'tank') continue;
      const info = npcInfo(s, npc.id);
      s.npcPositions.set(npc.id, s.encounter.adjustNpcTarget(info, info.pos));
    }
    return s;
  };

  it('does the next Plague Froth as soon as the last Burning Venom dies, with the marker instruction', () => {
    const s = toMarkerFroth();
    expect(s.encounter.frothTargets).toHaveLength(PLAGUE_FROTH_TARGET_COUNT);
    expect(s.encounter.prompt).toContain(FROTH_MARKER_PROMPT);
  });

  it('has each marked NPC stand on a marker of its own, and everyone else stack on the tanks', () => {
    const s = toMarkerFroth();
    const markerSpots = s.encounter.markers.map((m) => m.pos);
    const claimed = new Set<number>();
    const stack = MARKER_TANK_SPOT;
    const markedIds = s.encounter.frothTargets.map((t) => t.id).filter((id) => id !== PLAYER_ID);
    expect(markedIds).toHaveLength(4);

    for (const npc of s.fight.npcs) {
      const info = npcInfo(s, npc.id);
      const goal = s.encounter.adjustNpcTarget(info, info.pos);
      if (markedIds.includes(npc.id)) {
        const at = markerSpots.findIndex((p) => distance(p, goal) < 0.01);
        expect(at).toBeGreaterThanOrEqual(0);
        claimed.add(at);
      } else {
        expect(goal.x).toBeCloseTo(stack.x, 0); // tanks too
        expect(goal.y).toBeCloseTo(stack.y, 0);
      }
    }
    expect(claimed.size).toBe(4); // all different
  });

  it('keeps them there until the circles are gone', () => {
    const s = toMarkerFroth();
    const id = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!.id;
    const info = npcInfo(s, id);
    const before = s.encounter.adjustNpcTarget(info, info.pos);
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.5); // the circles are out
    expect(s.encounter.adjustNpcTarget(info, info.pos)).toEqual(before);
  });

  /** The marker nobody is standing on. */
  const emptyMarker = (s: ReturnType<typeof toMarkerFroth>): Vec2 => {
    const taken = s.encounter.frothTargets
      .filter((t) => t.id !== PLAYER_ID)
      .map((t) => {
        const info = npcInfo(s, t.id);
        return s.encounter.adjustNpcTarget(info, info.pos);
      });
    return s.encounter.markers
      .map((m) => m.pos)
      .find((p) => taken.every((t) => distance(t, p) > 1))!;
  };

  it('is fine for the player if they stand on the empty marker', () => {
    const s = toMarkerFroth();
    const spot = emptyMarker(s);
    s.playerPos.x = spot.x;
    s.playerPos.y = spot.y;
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    expect(s.fight.player.alive).toBe(true);
  });

  it('kills the player, with its own reason, if they are not on the empty marker', () => {
    const s = toMarkerFroth();
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    expect(s.fight.player.alive).toBe(false);
    s.fight.update(0);
    expect(s.fight.status).toBe('wiped');
    expect(s.fight.wipe?.detail).toBe(
      "Didn't stand on the open marker. Technically this wouldn't necessarily kill you, but I'm killing you anyways for not following directions.",
    );
  });

  it('replaces the totems with two, 10 meters apart, once the circles are gone, and takes Vashnik back', () => {
    const s = toMarkerFroth();
    const spot = emptyMarker(s);
    s.playerPos.x = spot.x;
    s.playerPos.y = spot.y;
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    // The totems from Imbibe are still around while the circles fly.
    runUntil(s, () => frothOver(s));
    runSafe(s, 0.1);
    expect(s.encounter.totems).toHaveLength(TOTEM_RESET_COUNT);
    expect(distance(s.encounter.totems[0]!.pos, s.encounter.totems[1]!.pos)).toBeCloseTo(
      TOTEM_RESET_DISTANCE,
    );
    expect(s.bossMoves.at(-1)).toEqual(BOSS_DESTINATION);
    // Everyone goes back to their usual places around him.
    const healer = s.fight.npcs.find((c) => c.role === 'healer')!;
    const info = npcInfo(s, healer.id);
    expect(s.encounter.adjustNpcTarget(info, info.pos)).toEqual(info.pos);
    expect(s.encounter.markersVisible).toBe(false);
    for (const t of s.encounter.totems) {
      expect(t.pos.y - t.radius).toBeGreaterThanOrEqual(ARENA_HEIGHT / 3 - 0.001);
      expect(distanceToPolygon(t.pos, POOL_POLYGON)).toBeGreaterThanOrEqual(t.radius);
    }
  });

  it('then goes round: bile after 5 seconds, then the totem Plague Froth 5 seconds after that', () => {
    const s = toMarkerFroth();
    const spot = emptyMarker(s);
    s.playerPos.x = spot.x;
    s.playerPos.y = spot.y;
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;

    runSafe(s, BILE_AFTER_TOTEM_RESET_SECONDS - 0.6);
    expect(s.encounter.prompt ?? '').not.toContain(CATALYTIC_BILE_PROMPT);
    runSafe(s, 0.8);
    expect(s.encounter.prompt).toContain(CATALYTIC_BILE_PROMPT);
    runUntil(s, () => s.encounter.bile !== null);
    s.playerPos.x = s.encounter.bile!.pos.x;
    s.playerPos.y = s.encounter.bile!.pos.y;
    runUntil(s, () => s.encounter.bile === null);
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;

    runSafe(s, FROTH_AFTER_BILE_SECONDS - 0.5);
    expect(s.encounter.frothTargets).toHaveLength(0);
    runSafe(s, 0.7);
    expect(s.encounter.frothTargets).toHaveLength(PLAGUE_FROTH_TARGET_COUNT);
    expect(s.encounter.prompt).toBe(FROTH_TOTEM_PROMPT);

    // Once its circles are gone, Vashnik imbibes 5 seconds later (and the totems being gone, lives).
    s.encounter.totems = [];
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS - 0.5);
    expect(s.encounter.prompt ?? '').not.toContain(FOCUS_PROMPT);
    runSafe(s, 0.7);
    expect(s.encounter.prompt).toContain(FOCUS_PROMPT);
    expect(s.fight.status).toBe('active');
  });

  it('wipes the raid at the next Imbibe if a totem is left after the totem Plague Froth', () => {
    const s = toMarkerFroth();
    const spot = emptyMarker(s);
    s.playerPos.x = spot.x;
    s.playerPos.y = spot.y;
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;
    runSafe(s, BILE_AFTER_TOTEM_RESET_SECONDS + 0.3);
    runUntil(s, () => s.encounter.bile !== null);
    s.playerPos.x = s.encounter.bile!.pos.x;
    s.playerPos.y = s.encounter.bile!.pos.y;
    runUntil(s, () => s.encounter.bile === null);
    s.playerPos.x = SAFE_SPOT.x;
    s.playerPos.y = SAFE_SPOT.y;
    runSafe(s, FROTH_AFTER_BILE_SECONDS + 0.3);
    runSafe(s, PLAGUE_FROTH_DELAY_SECONDS + 0.2);
    runUntil(s, () => frothOver(s));
    s.encounter.totems = [{ id: 'left-over', pos: { x: 600, y: 500 }, radius: 24 }]; // one left standing
    runSafe(s, IMBIBE_AFTER_FROTH_SECONDS + 0.3);
    expect(s.fight.raiders.every((r) => !r.alive)).toBe(true);
    s.fight.update(0);
    expect(s.fight.wipe?.detail).toBe('Vashnik imbibed while Malignant Totems were still up.');
  });

  it('has marked NPCs spread out, but not shoot circles into a totem, in the totem Plague Froth', () => {
    const s = scripted();
    s.run(0.1);
    // Make it the third cast, as it is in the real order of the fight.
    (s.encounter as unknown as { frothCasts: number }).frothCasts = 2;
    s.encounter.triggerPlagueFroth();
    const id = s.encounter.frothTargets.find((t) => t.id !== PLAYER_ID)!.id;
    const info = npcInfo(s, id);
    // A totem right on the NPC's north-east line.
    s.encounter.totems = [{ id: 't', pos: { x: info.pos.x + 90, y: info.pos.y - 90 }, radius: 24 }];
    const goal = s.encounter.adjustNpcTarget(info, info.pos);
    const total = s.encounter.totems[0]!;
    // None of its four lines passes through the totem from where it will stand.
    for (const dir of [
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ]) {
      const d = { x: dir.x * Math.SQRT1_2, y: dir.y * Math.SQRT1_2 };
      const o = {
        x: goal.x + d.x * PLAGUE_FROTH_START_DISTANCE,
        y: goal.y + d.y * PLAGUE_FROTH_START_DISTANCE,
      };
      const rx = total.pos.x - o.x;
      const ry = total.pos.y - o.y;
      const along = rx * d.x + ry * d.y;
      const across = Math.abs(rx * d.y - ry * d.x);
      if (along >= 0) expect(across).toBeGreaterThanOrEqual(total.radius + 12);
    }
  });

  it('has NPCs step out of the way of the player circles in the totem Plague Froth, but not before', () => {
    const s = scripted();
    s.run(0.1);
    s.playerPos.x = 400;
    s.playerPos.y = 400;
    (s.encounter as unknown as { frothCasts: number }).frothCasts = 2;
    s.encounter.triggerPlagueFroth();
    s.encounter.frothTargets.find((t) => t.id === PLAYER_ID)!.pos = { x: 400, y: 400 };
    // A spot on the player's north-east line, 100 px along it.
    const onLine = { x: 400 + 70.7, y: 400 - 70.7 };
    const bystander = s.fight.npcs.find(
      (c) => c.role !== 'tank' && !s.encounter.frothTargets.some((t) => t.id === c.id),
    )!;
    s.npcPositions.set(bystander.id, onLine);
    const info = npcInfo(s, bystander.id);
    const goal = s.encounter.adjustNpcTarget(info, onLine);
    expect(distance(goal, onLine)).toBeGreaterThan(10);

    // In the first Plague Froth they do not bother.
    const first = scripted();
    first.run(0.1);
    first.playerPos.x = 300;
    first.playerPos.y = 300;
    first.encounter.triggerPlagueFroth();
    first.encounter.frothTargets.find((t) => t.id === PLAYER_ID)!.pos = { x: 400, y: 400 };
    const bystander2 = first.fight.npcs.find(
      (c) => c.role !== 'tank' && !first.encounter.frothTargets.some((t) => t.id === c.id),
    )!;
    first.npcPositions.set(bystander2.id, onLine);
    const info2 = npcInfo(first, bystander2.id);
    expect(first.encounter.adjustNpcTarget(info2, onLine)).toEqual(onLine);
  });

  it('enrages the boss if it is still alive after six minutes', () => {
    const s = setup(choices.rogue!);
    s.run(ENRAGE_SECONDS - 1);
    expect(s.fight.enraged).toBe(false);
    s.run(2);
    expect(s.fight.enraged).toBe(true);
  });
});

describe('Vashnik: the fountains and the lines to the pool', () => {
  it('keeps the bile inside the lines from the fountains to the pool', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(choices.rogue!, undefined, seed);
      s.state.walking = false;
      s.encounter.triggerCatalyticBile();
      for (let t = 0; t < 4 && !s.encounter.bile; t += 0.05) s.run(0.05);
      const { pos, radius } = s.encounter.bile!;
      expect(pointInPolygon(pos, BILE_AREA)).toBe(true);
      expect(distance(pos, closestPointOnPolygon(pos, BILE_AREA))).toBeGreaterThanOrEqual(radius);
    }
  });

  it('never puts a totem on a fountain', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(choices.rogue!, undefined, seed);
      s.state.walking = false;
      s.encounter.triggerImbibe();
      s.run(MALIGNANT_TOTEM_DELAY_SECONDS + 0.2);
      expect(s.encounter.totems.length).toBeGreaterThan(0);
      for (const totem of s.encounter.totems) {
        for (const f of FOUNTAIN_AREAS) {
          const nx = Math.min(f.x + f.width, Math.max(f.x, totem.pos.x));
          const ny = Math.min(f.y + f.height, Math.max(f.y, totem.pos.y));
          expect(Math.hypot(totem.pos.x - nx, totem.pos.y - ny)).toBeGreaterThanOrEqual(
            totem.radius,
          );
        }
      }
    }
  });
});
