import Phaser from 'phaser';
import { COLORS } from '../game/config';
import { LOG_FONT_SIZE, LOG_MAX_MESSAGES } from '../fight/config';
import { addText } from './render';

export interface LogArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 8;
/** Room for the title above the messages. */
const TITLE_HEIGHT = 26;
const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_GAP = 4;
/** How many lines one turn of the mouse wheel scrolls. */
const WHEEL_LINES = 3;
const LINE_SPACING = 3;
/** The dashed line drawn between messages. */
const DASH_LENGTH = 4;
const DASH_GAP = 3;
const DASH_COLOR = 0x8aa08a;
const DASH_ALPHA = 0.55;

/**
 * A small panel listing what has happened in the fight, newest at the bottom. When there are more
 * lines than fit, a scrollbar appears: scroll with the mouse wheel over the box, or drag or click
 * the bar. It stays pinned to the newest message unless you have scrolled up to read older ones.
 */
export class CombatLog {
  private readonly messages: string[] = [];
  private readonly body: Phaser.GameObjects.Text;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Rectangle;
  private readonly dashes: Phaser.GameObjects.Graphics;
  private readonly textLeft: number;
  private readonly textWidth: number;
  private readonly area: LogArea;
  private readonly bodyTop: number;
  private readonly viewHeight: number;
  private readonly lineHeight: number;
  private readonly visibleLines: number;
  private readonly trackHeight: number;

  /** Every wrapped line of every message, oldest first. A null is a gap between two messages. */
  private lines: (string | null)[] = [];
  /** How many lines are scrolled off the top. */
  private offset = 0;
  private dragging = false;

  constructor(scene: Phaser.Scene, area: LogArea) {
    this.area = area;
    const { x, y, width, height } = area;
    scene.add
      .rectangle(x, y, width, height, 0x000000, 0.35)
      .setOrigin(0)
      .setStrokeStyle(1, COLORS.arenaBorder);
    addText(scene, x + PADDING, y + 6, 'Fight Log', { fontSize: '12px', color: COLORS.muted });

    // Messages wrap inside the box, leaving room on the right for the scrollbar.
    const textWidth = width - PADDING * 2 - SCROLLBAR_WIDTH - SCROLLBAR_GAP;
    this.textLeft = x + PADDING;
    this.textWidth = textWidth;
    this.bodyTop = y + TITLE_HEIGHT;
    this.dashes = scene.add.graphics();
    this.body = addText(scene, x + PADDING, this.bodyTop, '', {
      fontSize: `${LOG_FONT_SIZE}px`,
      color: COLORS.text,
      wordWrap: { width: textWidth },
      lineSpacing: LINE_SPACING,
    });

    // Measure how far apart lines are (the gap between one and two lines of text, which includes
    // the line spacing), so we know how many fit in the box without spilling out of it.
    this.body.setText('Ag');
    const oneLine = this.body.height;
    this.body.setText('Ag\nAg');
    this.lineHeight = this.body.height - oneLine;
    this.body.setText('');
    this.viewHeight = height - TITLE_HEIGHT - PADDING;
    this.visibleLines = Math.max(1, Math.floor(this.viewHeight / this.lineHeight));

    // The scrollbar: a track down the right edge and a draggable thumb. Hidden until needed.
    const barX = x + width - PADDING / 2 - SCROLLBAR_WIDTH;
    this.trackHeight = this.viewHeight;
    this.track = scene.add
      .rectangle(barX, this.bodyTop, SCROLLBAR_WIDTH, this.trackHeight, 0xffffff, 0.12)
      .setOrigin(0)
      .setVisible(false);
    this.thumb = scene.add
      .rectangle(barX, this.bodyTop, SCROLLBAR_WIDTH, 20, 0xffffff, 0.5)
      .setOrigin(0)
      .setVisible(false);
    this.track.setInteractive({ useHandCursor: true });
    this.thumb.setInteractive({ useHandCursor: true });

    this.track.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.scrollToPointer(pointer);
    });
    this.thumb.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.scrollToPointer(pointer);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragging && pointer.isDown) this.scrollToPointer(pointer);
    });
    scene.input.on('pointerup', () => {
      this.dragging = false;
    });
    scene.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (!this.contains(pointer.worldX, pointer.worldY)) return;
        this.scrollBy(Math.sign(dy) * WHEEL_LINES);
      },
    );
  }

  add(message: string): void {
    const wasAtBottom = this.offset >= this.maxOffset;

    this.messages.push(message);
    if (this.messages.length > LOG_MAX_MESSAGES) this.messages.shift();
    // A blank row (null) goes between messages; render() draws a dashed line across it.
    this.lines = this.messages.flatMap((m, i) => [
      ...(i > 0 ? [null] : []),
      ...this.body.getWrappedText(m),
    ]);

    // Keep following the newest message, unless the player has scrolled up to read older ones.
    this.offset = wasAtBottom ? this.maxOffset : Math.min(this.offset, this.maxOffset);
    this.render();
  }

  private get maxOffset(): number {
    return Math.max(0, this.lines.length - this.visibleLines);
  }

  private contains(worldX: number, worldY: number): boolean {
    const { x, y, width, height } = this.area;
    return worldX >= x && worldX <= x + width && worldY >= y && worldY <= y + height;
  }

  private scrollBy(lines: number): void {
    const next = Math.min(this.maxOffset, Math.max(0, this.offset + lines));
    if (next === this.offset) return;
    this.offset = next;
    this.render();
  }

  /** Puts the scroll position where the pointer is on the scrollbar. */
  private scrollToPointer(pointer: Phaser.Input.Pointer): void {
    const thumbHeight = this.thumb.height;
    const room = this.trackHeight - thumbHeight;
    if (room <= 0) return;
    // Aim the middle of the thumb at the pointer.
    const fraction = (pointer.worldY - this.bodyTop - thumbHeight / 2) / room;
    const next = Math.round(Math.min(1, Math.max(0, fraction)) * this.maxOffset);
    if (next === this.offset) return;
    this.offset = next;
    this.render();
  }

  /** Draws a dashed line across every gap between messages that is currently on screen. */
  private drawDashes(shown: (string | null)[]): void {
    this.dashes.clear();
    this.dashes.lineStyle(1, DASH_COLOR, DASH_ALPHA);
    shown.forEach((line, row) => {
      if (line !== null) return;
      const y = this.bodyTop + row * this.lineHeight + this.lineHeight / 2;
      for (let x = 0; x < this.textWidth; x += DASH_LENGTH + DASH_GAP) {
        const end = Math.min(x + DASH_LENGTH, this.textWidth);
        this.dashes.beginPath();
        this.dashes.moveTo(this.textLeft + x, y);
        this.dashes.lineTo(this.textLeft + end, y);
        this.dashes.strokePath();
      }
    });
  }

  /** Shows the lines that fit from the current scroll position, and sizes the scrollbar. */
  private render(): void {
    const shown = this.lines.slice(this.offset, this.offset + this.visibleLines);
    this.body.setText(shown.map((line) => line ?? '').join('\n'));
    this.drawDashes(shown);

    const needsScrollbar = this.lines.length > this.visibleLines;
    this.track.setVisible(needsScrollbar);
    this.thumb.setVisible(needsScrollbar);
    if (!needsScrollbar) return;

    // The thumb is as tall as the share of the log that is visible, and sits at our position.
    const thumbHeight = Math.max(
      16,
      Math.round((this.visibleLines / this.lines.length) * this.trackHeight),
    );
    const room = this.trackHeight - thumbHeight;
    const progress = this.maxOffset === 0 ? 0 : this.offset / this.maxOffset;
    this.thumb.setSize(SCROLLBAR_WIDTH, thumbHeight);
    this.thumb.setPosition(this.thumb.x, this.bodyTop + progress * room);
    // Rectangles keep their hit area when resized this way, so refresh it for the new height.
    this.thumb.input?.hitArea?.setSize?.(SCROLLBAR_WIDTH, thumbHeight);
  }
}
