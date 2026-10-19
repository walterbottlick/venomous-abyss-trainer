/** Fixed logical game size. Phaser scales this to fit the browser window. */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** The square the player moves around in, on the left; the rest is the side panel. */
export const ARENA_SIZE = 540;
export const PANEL_X = ARENA_SIZE;
export const PANEL_WIDTH = GAME_WIDTH - ARENA_SIZE;

export const COLORS = {
  background: 0x0b0f14,
  arena: 0x16202b,
  arenaBorder: 0x3a5a40,
  panel: 0x101820,
  button: 0x1f3a2a,
  buttonHover: 0x2f5a40,
  text: '#e8f0e8',
  muted: '#8aa08a',
} as const;
