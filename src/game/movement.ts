export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MoveInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Unit-length (or zero) direction for the held keys; opposing keys cancel out. */
export function directionFromInput({ left, right, up, down }: MoveInput): Vec2 {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** Move `pos` by `dir * speed * dtSeconds`, clamped to `bounds`. Pure: no Phaser involved. */
export function step(pos: Vec2, dir: Vec2, speed: number, dtSeconds: number, bounds: Bounds): Vec2 {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, pos.x + dir.x * speed * dtSeconds)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, pos.y + dir.y * speed * dtSeconds)),
  };
}
