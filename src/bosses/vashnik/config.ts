import { ARENA_HEIGHT, ARENA_WIDTH } from '../../game/config';
import { lerp } from '../../game/geometry';
import type { MarkerId } from '../../assets/manifest';
import type { Vec2 } from '../../game/movement';

/**
 * Positions and numbers for the Vashnik fight.
 *
 * HOW POSITIONS WORK: every position here is in arena pixels. (0, 0) is the top-left corner of the
 * play area (the 690x540 area on the left of the screen, not the whole 960x540 canvas), x grows to
 * the right up to ARENA_WIDTH (690), and y grows DOWNWARD up to ARENA_HEIGHT (540). So the
 * bottom-right corner of the arena is (690, 540). 10 pixels is 1 in-game meter (PIXELS_PER_METER).
 * The coordinates below were measured from the background art (public/assets/bosses/
 * vashnik-the-malignant/background.png, 1114x870), scaled down by 690 / 1114.
 */

// --- The acid pool ------------------------------------------------------------------------------

/**
 * The yellow-green coffin-shaped pool at the top of the room, as the corners of a polygon in
 * order (down the left side, then back up the right). A raider whose icon centre is inside it
 * dies instantly. NPC raiders steer around it.
 */
export const POOL_POLYGON: readonly Vec2[] = [
  { x: 292, y: 0 },
  { x: 282, y: 40 },
  { x: 272, y: 80 },
  { x: 260, y: 120 },
  { x: 250, y: 160 },
  { x: 255, y: 170 },
  { x: 263, y: 180 },
  { x: 275, y: 190 },
  { x: 285, y: 200 },
  { x: 295, y: 210 },
  { x: 302, y: 217 },
  { x: 363, y: 217 },
  { x: 370, y: 210 },
  { x: 380, y: 200 },
  { x: 390, y: 190 },
  { x: 402, y: 180 },
  { x: 410, y: 170 },
  { x: 415, y: 160 },
  { x: 405, y: 120 },
  { x: 393, y: 80 },
  { x: 383, y: 40 },
  { x: 373, y: 0 },
];

/** The minions walk toward this point, in the middle of the pool. Reaching the pool is a wipe. */
export const POOL_TARGET: Vec2 = { x: 332, y: 110 };

/** Extra distance, in pixels, NPCs keep between themselves and the pool's edge. */
export const POOL_AVOID_MARGIN = 6;

// --- Where everyone starts, and where the tanks take Vashnik ---------------------------------

/** The middle of the huddle the whole raid starts in (the bottom centre of the arena). */
export const RAID_START: Vec2 = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 60 };

/** Where Vashnik stands when the fight begins: just below the pool, not in it. */
export const BOSS_START: Vec2 = { x: 332, y: 253 };

/** Vashnik's health. Overrides the shared default (BOSS_MAX_HEALTH in fight/config.ts). */
export const VASHNIK_MAX_HEALTH = 900;

/** The corner of the arena the tanks take Vashnik toward. */
export const ARENA_CORNER: Vec2 = { x: ARENA_WIDTH, y: ARENA_HEIGHT };

/** How far along the line from his start to that corner the tanks take him (2/3 of the way). */
export const BOSS_TRAVEL_FRACTION = 2 / 3;

/** Where the tanks take Vashnik once they have made contact with him. */
export const BOSS_DESTINATION: Vec2 = lerp(BOSS_START, ARENA_CORNER, BOSS_TRAVEL_FRACTION);

// --- Imbibe: the fountains and the minions -------------------------------------------------------

/**
 * Seconds between Vashnik starting to imbibe and the minions appearing. Exploding Infection (for a
 * healer player) goes out when they appear, and so do the Death Knight, Warlock and healer
 * instructions.
 */
export const MINION_SPAWN_DELAY_SECONDS = 3;

/** The fountains, in the bottom corners. Minions appear here. */
export const FIRE_FOUNTAIN: Vec2 = { x: 40, y: 478 };
export const SHADOW_FOUNTAIN: Vec2 = { x: 648, y: 478 };

export const SHROUDED_VENOM_COUNT = 5;
export const BURNING_VENOM_COUNT = 3;

/** How far from a fountain the minions are spread when they appear, so they don't stack. */
export const SHROUDED_SPAWN_SPREAD = 46;
export const BURNING_SPAWN_SPREAD = 38;

/** Diameter of a minion's icon, in pixels. */
export const MINION_SIZE = 28;

/** How fast minions walk toward the pool, in pixels per second (10 pixels is 1 meter). */
export const MINION_SPEED = 14;

/** Minions are pushed apart if they get closer than this (centre to centre) while walking. */
export const MINION_MIN_SEPARATION = 24;

// --- Killing the minions ---------------------------------------------------------------------------

/**
 * How long, in seconds, the raid needs to kill a minion, based on how many DPS are alive (the
 * player included): this number minus the DPS count, so each DPS that dies adds a second. With 6
 * DPS, Shrouded Venom (all five together) take 5 seconds and one Burning Venom takes 4.
 *
 * Time only counts while the raid is attacking that minion: the NPC DPS attack whatever the player
 * focuses (even when the player is out of range of it), but a DPS player who is out of range does
 * not add their own damage, so it takes a second longer. It adds up, so it is kept if the player
 * switches target. A healer player
 * can't attack, so the NPC DPS choose for them: Shrouded Venom first, then Burning Venom.
 */
export const SHROUDED_KILL_BASE = 12;
export const BURNING_KILL_BASE = 11;

/** Damage dealt to every raider when a Burning Venom dies. */
export const BURNING_DEATH_DAMAGE = 25;

// --- Death grip and banish ----------------------------------------------------------------------

/** Seconds after the Burning Venom appear before the NPCs death grip two of them. */
export const GRIP_DELAY_SECONDS = 2;
/** How fast a gripped minion is yanked across the room, in pixels per second. */
export const GRIP_SPEED = 700;
export const GRIP_LINE_COLOR = 0xff9a2e;
export const GRIP_LINE_WIDTH = 2;
/** A gripped minion lands this many pixels from the edge of whoever gripped it. */
export const GRIP_LANDING_GAP = 3;

/** Shown at the top of the screen to a DPS player while Vashnik imbibes, before the minions appear. */
export const FOCUS_PROMPT = 'Left click adds to focus them down!';
/** Shown to a healer player while anyone still has Exploding Infection. */
export const DISPEL_PROMPT = 'Right click to dispel Exploding Infection!';
/** Shown while Stygian Infection is dropping circles, until the last one explodes. */
export const STYGIAN_PROMPT = 'Keep moving to dodge purple circles!';
export const DEATH_GRIP_PROMPT = 'Right click to death grip the Burning Venom!';
export const BANISH_PROMPT = 'Right click to banish the third Burning Venom!';

// --- Shrouded Venom's aftermath: the purple circles ----------------------------------------------

export const ZONE_COUNT = 15;
/** Radius of a purple circle, in pixels. */
export const ZONE_RADIUS = 26;
/** Seconds between the circles appearing and exploding. */
export const ZONE_DELAY_SECONDS = 2;
export const ZONE_COLOR = 0x9b4dff;
/** Extra distance NPCs keep outside a circle while it is waiting to explode, in pixels. */
export const ZONE_AVOID_MARGIN = 4;

// --- Explosions -------------------------------------------------------------------------------------

export const BURNING_EXPLOSION_COLOR = 0xff3030;
export const SHROUDED_EXPLOSION_COLOR = 0xb066ff;
export const MINION_EXPLOSION_RADIUS = 40;

// --- Imbibe's effects on the raid -----------------------------------------------------------------

/**
 * Stygian Infection: when Vashnik imbibes, the player drops one of the purple circles (the same
 * kind Shrouded Venom leave behind) under their feet every `STYGIAN_DROP_INTERVAL_SECONDS`, for
 * `STYGIAN_INFECTION_SECONDS` in total (6 seconds, one a second, is 6 circles). Each explodes
 * after ZONE_DELAY_SECONDS, killing the player if they are still standing in it.
 */
export const STYGIAN_INFECTION_SECONDS = 6;
/** Seconds after the minions appear before Stygian Infection goes out. */
export const STYGIAN_INFECTION_DELAY_SECONDS = 4;
export const STYGIAN_DROP_INTERVAL_SECONDS = 1;

/**
 * Exploding Infection. Only when the player is a healer: Imbibe hits every raider with it, a
 * magic effect that a healer has to dispel. Anyone who still has it takes this much damage on
 * every tick (once a second).
 */
export const EXPLODING_INFECTION_DAMAGE = 20;
export const EXPLODING_INFECTION_TICK_SECONDS = 1;

// --- Catalytic Bile -------------------------------------------------------------------------------

/**
 * A green circle appears somewhere in the lower two thirds of the arena. When its time is up, the
 * whole raid is killed unless the player is standing in it. "Stand in the Catalytic Bile!" shows
 * for CATALYTIC_BILE_WARNING_SECONDS before the circle appears, and stays until its time is up.
 */
export const CATALYTIC_BILE_RADIUS = 40;
/** Seconds of warning, before the circle appears. */
export const CATALYTIC_BILE_WARNING_SECONDS = 2;
/** Seconds the circle is out, before it checks whether the player is standing in it. */
export const CATALYTIC_BILE_DURATION_SECONDS = 4;
/** The top of the area it can appear in, as a fraction of the arena's height (1/3: the lower 2/3). */
export const CATALYTIC_BILE_TOP_FRACTION = 1 / 3;
export const CATALYTIC_BILE_COLOR = 0x4cd137;
/** Extra space kept between the circle and any NPC when picking where it appears, in pixels. */
export const CATALYTIC_BILE_NPC_CLEARANCE = 10;
/** Extra distance NPCs keep outside the circle if they find themselves in it, in pixels. */
export const CATALYTIC_BILE_AVOID_MARGIN = 4;
export const CATALYTIC_BILE_PROMPT = 'Stand in the Catalytic Bile!';

// --- Plague Froth ---------------------------------------------------------------------------------

/**
 * Plague Froth marks a few raiders (always the player, never a tank). Each marked raider shows four
 * short lines pointing away diagonally. After PLAGUE_FROTH_DELAY_SECONDS a green circle shoots out
 * along each line and keeps going until it leaves the arena. A circle kills the player if it hits
 * them (from any raider, though never one they shot themselves). NPCs are never hurt by them.
 */
export const PLAGUE_FROTH_TARGET_COUNT = 5;
/** Seconds the lines show before the circles shoot out. */
export const PLAGUE_FROTH_DELAY_SECONDS = 5;
/** How fast the circles travel, in pixels per second. */
export const PLAGUE_FROTH_SPEED = 160;
/** The lines start at the edge of the raider's icon and are this long, in pixels. */
export const PLAGUE_FROTH_LINE_LENGTH = 30;
/** The circles start this far from the raider (centre to centre), so a raider standing on a marked one is not hit. 30 pixels is 3 meters. */
export const PLAGUE_FROTH_START_DISTANCE = 30;
export const PLAGUE_FROTH_LINE_WIDTH = 3;
export const PLAGUE_FROTH_COLOR = 0x4cd137;
/** How far apart marked NPCs try to stay from everyone else, in pixels. */
export const PLAGUE_FROTH_SPREAD_DISTANCE = 80;

// --- Malignant Totems -----------------------------------------------------------------------------

/** Imbibe puts this many Malignant Totems in the arena (see MALIGNANT_TOTEM_DELAY_SECONDS). */
export const MALIGNANT_TOTEM_COUNT = 8;
/** A totem's icon is this many times the size of an NPC raider's. */
export const MALIGNANT_TOTEM_SIZE_FACTOR = 3;
/** After an even Plague Froth, the totems are replaced by this many... */
export const TOTEM_RESET_COUNT = 2;
/** ...this far from each other (centre to centre, in pixels; 100 pixels is 10 meters). */
export const TOTEM_RESET_DISTANCE = 100;
/** Seconds after Imbibe is cast before the totems appear. */
export const MALIGNANT_TOTEM_DELAY_SECONDS = 6;
/** The top of the area they appear in, as a fraction of the arena's height (1/3: the lower 2/3). */
export const MALIGNANT_TOTEM_TOP_FRACTION = 1 / 3;
/** Smallest gap kept between totems when they appear, in pixels. */
export const MALIGNANT_TOTEM_SPACING = 10;
/** The top of the area the purple circles from dying Shrouded Venom can appear in (1/3: the lower 2/3). */
export const ZONE_TOP_FRACTION = 1 / 3;

// --- The order of the fight -----------------------------------------------------------------------

/**
 * The fight repeats one cycle. Seconds are counted from the moment the fight starts (the end of
 * the 3-2-1 countdown), or from the end of the step before.
 *
 *   FIRST_FROTH_SECONDS into the fight: Plague Froth (the aiming one, only done once)
 *   IMBIBE_AFTER_FROTH_SECONDS after its circles are gone: Imbibe
 *   when the BURNING_KILLS_FOR_BILE-th Burning Venom dies: Catalytic Bile, the last Burning Venom
 *     breaks out of its banish, and the tanks take Vashnik to the markers
 *   when the last Burning Venom dies: Plague Froth (the markers one)
 *   when its circles are gone: the totems are replaced, the tanks take Vashnik back, and
 *   BILE_AFTER_TOTEM_RESET_SECONDS later: Catalytic Bile
 *   FROTH_AFTER_BILE_SECONDS after the bile is resolved: Plague Froth (the totems one)
 *   IMBIBE_AFTER_FROTH_SECONDS after its circles are gone: Imbibe, and round again
 */
export const FIRST_FROTH_SECONDS = 5;
export const IMBIBE_AFTER_FROTH_SECONDS = 5;
export const BURNING_KILLS_FOR_BILE = 2;
export const BILE_AFTER_TOTEM_RESET_SECONDS = 5;
export const FROTH_AFTER_BILE_SECONDS = 5;
/** If the boss is still alive this many seconds into the fight, it enrages. */
export const ENRAGE_SECONDS = 6 * 60;

export const FROTH_AIM_PROMPT = 'Aim plague waves away from teammates and dodge them yourself!';
export const FROTH_MARKER_PROMPT = 'Stand on one of the empty markers!';
export const FROTH_TOTEM_PROMPT = 'Destroy the two totems with plague waves!';

// --- Markers -----------------------------------------------------------------------------------------

/** The markers, in order from the top, are laid out along a line starting at the pool's bottom-left corner. */
export const MARKER_ORDER: readonly MarkerId[] = ['cross', 'triangle', 'diamond', 'star', 'moon'];
/** The corner of the pool the line starts from. */
export const MARKER_LINE_START: Vec2 = POOL_POLYGON[10]!;
/** How far the first marker is from that corner, and the gap between markers, in pixels. */
export const MARKER_FIRST_OFFSET = 30;
export const MARKER_SPACING = 60;
/** How far the line leans to the left of straight down, in degrees. */
export const MARKER_LINE_TILT_DEGREES = 10;
export const MARKER_SIZE = 28;
/** The player counts as standing on a marker when their icon centre is this close to its centre. */
export const MARKER_STAND_RADIUS = 22;

export interface Marker {
  id: MarkerId;
  pos: Vec2;
}

export const MARKERS: readonly Marker[] = MARKER_ORDER.map((id, i) => {
  const along = MARKER_FIRST_OFFSET + i * MARKER_SPACING;
  const tilt = (MARKER_LINE_TILT_DEGREES * Math.PI) / 180;
  return {
    id,
    pos: {
      x: MARKER_LINE_START.x - Math.sin(tilt) * along,
      y: MARKER_LINE_START.y + Math.cos(tilt) * along,
    },
  };
});

/** The tanks, and everyone not marked by Plague Froth, stand stacked between the diamond and the star... */
export const MARKER_TANK_SPOT: Vec2 = lerp(MARKERS[2]!.pos, MARKERS[3]!.pos, 0.5);
/** ...with Vashnik to their right, this far from that spot (centre to centre, in pixels). */
export const MARKER_BOSS_OFFSET = 47;

// --- The fountains and the lines from them to the pool --------------------------------------------

/**
 * The two fountains drawn in the bottom corners of the background, as rectangles. Malignant
 * Totems never appear on them. (Not to be confused with FIRE_FOUNTAIN and SHADOW_FOUNTAIN, the
 * points the minions come out of.)
 */
export const FOUNTAIN_AREAS: readonly { x: number; y: number; width: number; height: number }[] = [
  { x: 0, y: 390, width: 62, height: ARENA_HEIGHT - 390 },
  { x: ARENA_WIDTH - 72, y: 385, width: 72, height: ARENA_HEIGHT - 385 },
];

/**
 * The area Catalytic Bile can appear in: bounded by a straight line from each fountain to where
 * the jagged channel on the background meets the acid pool (the channels themselves are not traced
 * exactly), and by the edge of the arena below.
 */
export const BILE_AREA: readonly Vec2[] = [
  { x: 251, y: 204 }, // where the left channel meets the pool
  { x: 406, y: 198 }, // where the right channel meets the pool
  { x: 613, y: 390 }, // the right fountain
  { x: 613, y: ARENA_HEIGHT },
  { x: 43, y: ARENA_HEIGHT },
  { x: 43, y: 406 }, // the left fountain
];
