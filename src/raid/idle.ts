import type { Vec2 } from '../game/movement';

/** One NPC's idle wandering: where it is drifting to, and how long it rests first. */
export interface IdleState {
  /** Current offset from the NPC's standing spot. Always within `radius` of zero. */
  offset: Vec2;
  target: Vec2;
  /** Seconds left to rest before drifting to `target`. */
  rest: number;
}

export interface IdleOptions {
  radius: number;
  /** Drift speed, pixels per second. */
  speed: number;
  /** Rest time between drifts, in seconds: [shortest, longest]. */
  pause: readonly [number, number];
  /** Returns a number in [0, 1). Pass a seeded one in tests. */
  random: () => number;
}

export function createIdle(random: () => number, pause: readonly [number, number]): IdleState {
  // Start each NPC at a different point in its rest, so they don't all move in step.
  return {
    offset: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    rest: pause[0] + random() * (pause[1] - pause[0]),
  };
}

/** Advances the idle wander by `dtSeconds`. Returns a new state; the input is not changed. */
export function stepIdle(state: IdleState, dtSeconds: number, options: IdleOptions): IdleState {
  const { radius, speed, pause, random } = options;

  if (state.rest > 0) {
    return { ...state, rest: state.rest - dtSeconds };
  }

  const dx = state.target.x - state.offset.x;
  const dy = state.target.y - state.offset.y;
  const distance = Math.hypot(dx, dy);
  const travel = speed * dtSeconds;

  if (distance > travel) {
    return {
      ...state,
      offset: {
        x: state.offset.x + (dx / distance) * travel,
        y: state.offset.y + (dy / distance) * travel,
      },
    };
  }

  // Arrived: rest, then choose a new random spot within the wander radius.
  const angle = random() * Math.PI * 2;
  const reach = Math.sqrt(random()) * radius; // sqrt gives an even spread across the disc
  return {
    offset: state.target,
    target: { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach },
    rest: pause[0] + random() * (pause[1] - pause[0]),
  };
}
