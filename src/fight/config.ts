import type { RaidRole } from '../raid/types';

/**
 * Tunable numbers and colours for health, healing, death, debuffs, enrage and the wipe screen.
 * Times are in seconds. Colours are 0xRRGGBB numbers unless the name says CSS (a '#rrggbb' string,
 * used for text). "Alpha" is opacity: 0 is invisible, 1 is solid.
 */

// --- Health -----------------------------------------------------------------------------------

/** Maximum health by role. The player uses the entry for their own role. */
export const MAX_HEALTH: Record<RaidRole, number> = {
  tank: 200,
  healer: 100,
  melee: 100,
  ranged: 100,
};

/** Default boss health. Individual fights can pass their own (e.g. fights with several bosses). */
export const BOSS_MAX_HEALTH = 400;

/**
 * The health bar: a ring around each icon that disappears clockwise from the top as health is
 * lost, and returns counter-clockwise as it is healed.
 */
export const HEALTH_RING_COLOR = 0xd91414;
/** Ring thickness in game pixels. Used for the player, NPC and boss rings alike. */
export const HEALTH_RING_WIDTH = 3;
/**
 * When true, the player's own ring (their class colour) also works as their health bar. When
 * false, it stays a full ring and the player's health is only shown by the low-health pulse.
 */
export const PLAYER_RING_SHOWS_HEALTH = true;

// --- Low health pulse ---------------------------------------------------------------------------

/** At or below this much health, the raider's icon pulses red. */
export const LOW_HEALTH_THRESHOLD = 30;
export const LOW_HEALTH_OVERLAY_COLOR = 0xff0000;
/** Opacity at the brightest point of the pulse. */
export const LOW_HEALTH_OVERLAY_MAX_ALPHA = 0.5;
/** One full fade in and out. */
export const LOW_HEALTH_PULSE_SECONDS = 1;

// --- Healing and dispelling -------------------------------------------------------------------

/** Health restored by one heal (a click for the player; one cast for an NPC healer). */
export const HEAL_AMOUNT = 15;
/**
 * How long a healer, player or NPC, must wait after any ability (a heal or a dispel) before using
 * another. The two share one timer, so healing blocks dispelling for this long, and vice versa.
 */
export const HEALER_COOLDOWN_SECONDS = 1;

/** The green flash on a healed icon: appears at `START_ALPHA`, then fades out over `SECONDS`. */
export const HEAL_FLASH_COLOR = 0x2ecc40;
export const HEAL_FLASH_START_ALPHA = 0.55;
export const HEAL_FLASH_SECONDS = 1;

/**
 * How NPC healers choose who to heal: 'lowest-health' picks the raider with the least health
 * left (so a tank at 40 of 200 loses out to a DPS at 35 of 100), 'lowest-percent' picks the
 * lowest fraction of their own maximum.
 */
export const NPC_HEAL_PRIORITY: 'lowest-health' | 'lowest-percent' = 'lowest-percent';

/** The blue overlay on a raider hit by a magic effect that needs dispelling. */
export const DISPEL_OVERLAY_COLOR = 0x2f7bff;
export const DISPEL_OVERLAY_ALPHA = 0.45;

// --- Death --------------------------------------------------------------------------------------

/** A dead raider's icon is covered with this to darken it (it stays visible underneath). */
export const DEATH_DARKEN_COLOR = 0x000000;
export const DEATH_DARKEN_ALPHA = 0.6;
/** How long a dead NPC's icon stays before it starts to fade, and how long the fade takes. */
export const DEATH_LINGER_SECONDS = 3;
export const DEATH_FADE_SECONDS = 1;

// --- Enrage -----------------------------------------------------------------------------------

/** The white pulse on an enraged boss. */
export const ENRAGE_OVERLAY_COLOR = 0xffffff;
export const ENRAGE_OVERLAY_MAX_ALPHA = 0.55;
export const ENRAGE_PULSE_SECONDS = 1;
/** After the boss enrages, the raid has this long to kill it before the fight is a wipe. */
export const ENRAGE_WIPE_DELAY_SECONDS = 5;

// --- Wipe screen ------------------------------------------------------------------------------

/** The dark layer over the arena. Lower the alpha to see more of the fight behind it. */
export const WIPE_OVERLAY_COLOR = 0x000000;
export const WIPE_OVERLAY_ALPHA = 0.9;
/** Skull icon diameter, its distance from the top of the arena, and the text styles. */
export const WIPE_SKULL_SIZE = 140;
export const WIPE_SKULL_TOP = 40;
export const WIPE_TITLE_TEXT = 'You Wiped';
export const WIPE_TITLE_COLOR_CSS = '#e02020';
export const WIPE_TITLE_FONT_SIZE = 52;
export const WIPE_MESSAGE_COLOR_CSS = '#e8f0e8';
export const WIPE_MESSAGE_FONT_SIZE = 18;

/** The buttons along the bottom of the wipe screen. */
export const WIPE_RETRY_LABEL = 'Try again';
export const WIPE_BACK_LABEL = 'Back to bosses';

// --- Victory screen -----------------------------------------------------------------------------

/**
 * Shown when the boss is killed. It is laid out like the wipe screen and shares its overlay
 * (WIPE_OVERLAY_*), icon size (WIPE_SKULL_*), and font sizes, with the star instead of the skull.
 */
export const VICTORY_TITLE_TEXT = 'You won!';
export const VICTORY_TITLE_COLOR_CSS = '#2ecc40';
export const VICTORY_MESSAGE =
  'Now I expect you to do every mechanic perfectly in a real raid, or else.';
export const VICTORY_RETRY_LABEL = 'Keep practicing... just to be safe';
export const VICTORY_BACK_LABEL = 'Back to bosses';

// --- Fight log (the panel on the right) ---------------------------------------------------------

/** How many of the latest messages the log shows. */
export const LOG_MAX_MESSAGES = 12;
export const LOG_FONT_SIZE = 13;

// --- Clicking ---------------------------------------------------------------------------------

/** Extra pixels around an icon that still count as clicking it, so small icons are easier to hit. */
export const CLICK_PADDING = 4;
