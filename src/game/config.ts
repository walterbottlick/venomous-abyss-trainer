/** Fixed logical game size. Phaser scales this to fit the browser window. */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/**
 * The play area on the left. It matches the shape of the arena backgrounds (1114x870, about
 * 1.28:1) so they show in full, uncropped. The rest of the width is the side panel.
 */
export const ARENA_WIDTH = 690;
export const ARENA_HEIGHT = 540;
export const PANEL_X = ARENA_WIDTH;
export const PANEL_WIDTH = GAME_WIDTH - ARENA_WIDTH;

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

/**
 * The canvas is rendered at this multiple of the logical 960x540 size, then scaled to fit the
 * window by the browser. Without it everything looks blurry on high-DPI displays.
 */
export const RENDER_SCALE = 2;
