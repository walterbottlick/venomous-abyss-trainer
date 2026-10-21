import Phaser from 'phaser';
import { markerKey } from '../assets/manifest';
import {
  VICTORY_BACK_LABEL,
  VICTORY_MESSAGE,
  VICTORY_RETRY_LABEL,
  VICTORY_TITLE_COLOR_CSS,
  VICTORY_TITLE_TEXT,
  WIPE_BACK_LABEL,
  WIPE_DETAIL_COLOR_CSS,
  WIPE_DETAIL_FONT_SIZE,
  WIPE_MESSAGE_COLOR_CSS,
  WIPE_MESSAGE_FONT_SIZE,
  WIPE_OVERLAY_ALPHA,
  WIPE_OVERLAY_COLOR,
  WIPE_RETRY_LABEL,
  WIPE_SKULL_SIZE,
  WIPE_SKULL_TOP,
  WIPE_TITLE_COLOR_CSS,
  WIPE_TITLE_FONT_SIZE,
  WIPE_TITLE_TEXT,
} from '../fight/config';
import { createButton } from './button';
import { addText } from './render';

/** What the two buttons on an end screen do. */
export interface EndScreenActions {
  /** Start the fight over. */
  onRetry: () => void;
  /** Leave to the boss menu. */
  onExit: () => void;
}

interface EndScreenOptions extends EndScreenActions {
  iconKey: string;
  title: string;
  titleColor: string;
  message: string;
  /** A smaller line under the message (the wipe screen's "Reason:"). */
  detail?: string;
  retryLabel: string;
  exitLabel: string;
}

/** Approximate width of one character of button text, to size buttons to their labels. */
const CHAR_WIDTH = 12;
const BUTTON_PADDING = 36;
const BUTTON_GAP = 16;
const BUTTON_BOTTOM_MARGIN = 50;

/**
 * Covers the arena with a dark layer (the fight stays faintly visible behind it) and shows a big
 * icon, a large title, a message, and two buttons along the bottom. Everything sits above the
 * arena only, so the side panel stays usable.
 */
function showEndScreen(
  scene: Phaser.Scene,
  arena: { width: number; height: number },
  options: EndScreenOptions,
): Phaser.GameObjects.Container {
  const centerX = arena.width / 2;
  const overlay = scene.add
    .rectangle(0, 0, arena.width, arena.height, WIPE_OVERLAY_COLOR, WIPE_OVERLAY_ALPHA)
    .setOrigin(0);
  // The overlay also stops clicks reaching the icons underneath.
  overlay.setInteractive();

  const icon = scene.add
    .image(centerX, WIPE_SKULL_TOP + WIPE_SKULL_SIZE / 2, options.iconKey)
    .setDisplaySize(WIPE_SKULL_SIZE, WIPE_SKULL_SIZE);

  const titleY = WIPE_SKULL_TOP + WIPE_SKULL_SIZE + 24;
  const title = addText(scene, centerX, titleY, options.title, {
    fontSize: `${WIPE_TITLE_FONT_SIZE}px`,
    color: options.titleColor,
    fontStyle: 'bold',
  }).setOrigin(0.5, 0);

  const message = addText(scene, centerX, titleY + WIPE_TITLE_FONT_SIZE + 24, options.message, {
    fontSize: `${WIPE_MESSAGE_FONT_SIZE}px`,
    color: WIPE_MESSAGE_COLOR_CSS,
    align: 'center',
    wordWrap: { width: arena.width - 100 },
  }).setOrigin(0.5, 0);

  const detail = options.detail
    ? addText(scene, centerX, message.y + message.height + 14, options.detail, {
        fontSize: `${WIPE_DETAIL_FONT_SIZE}px`,
        color: WIPE_DETAIL_COLOR_CSS,
        align: 'center',
        wordWrap: { width: arena.width - 100 },
      }).setOrigin(0.5, 0)
    : null;

  // Two buttons side by side, centred, each as wide as its label needs.
  const labels = [options.retryLabel, options.exitLabel];
  const widths = labels.map((l) => l.length * CHAR_WIDTH + BUTTON_PADDING);
  const rowWidth = widths[0]! + widths[1]! + BUTTON_GAP;
  const y = arena.height - BUTTON_BOTTOM_MARGIN;
  const actions = [options.onRetry, options.onExit];
  const buttons = labels.map((label, i) => {
    const x =
      centerX -
      rowWidth / 2 +
      (i === 0 ? widths[0]! / 2 : widths[0]! + BUTTON_GAP + widths[1]! / 2);
    return createButton(scene, x, y, label, actions[i]!, { width: widths[i]! });
  });

  return scene.add
    .container(0, 0, [overlay, icon, title, message, ...(detail ? [detail] : []), ...buttons])
    .setDepth(1000);
}

/** The "You Wiped" screen: skull, red title, the reason, and Try again / Back to bosses. */
export function showWipeScreen(
  scene: Phaser.Scene,
  arena: { width: number; height: number },
  message: string,
  detail: string,
  actions: EndScreenActions,
): Phaser.GameObjects.Container {
  return showEndScreen(scene, arena, {
    ...actions,
    iconKey: markerKey('skull'),
    title: WIPE_TITLE_TEXT,
    titleColor: WIPE_TITLE_COLOR_CSS,
    message,
    detail: `Reason: ${detail}`,
    retryLabel: WIPE_RETRY_LABEL,
    exitLabel: WIPE_BACK_LABEL,
  });
}

/** The "You won!" screen: star, green title, a fixed message, and the two buttons. */
export function showVictoryScreen(
  scene: Phaser.Scene,
  arena: { width: number; height: number },
  actions: EndScreenActions,
): Phaser.GameObjects.Container {
  return showEndScreen(scene, arena, {
    ...actions,
    iconKey: markerKey('star'),
    title: VICTORY_TITLE_TEXT,
    titleColor: VICTORY_TITLE_COLOR_CSS,
    message: VICTORY_MESSAGE,
    retryLabel: VICTORY_RETRY_LABEL,
    exitLabel: VICTORY_BACK_LABEL,
  });
}
