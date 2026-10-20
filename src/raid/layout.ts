import type { Vec2 } from '../game/movement';
import { ARENA_EDGE_MARGIN, IDLE_RADIUS, MIN_NPC_GAP, ROLE_LAYOUT } from './config';
import type { RaidRole } from './types';

export interface LayoutInput {
  /** One entry per NPC; the order within a role decides who stands where. */
  roles: readonly RaidRole[];
  boss: Vec2;
  bossRadius: number;
  npcRadius: number;
  arena: { width: number; height: number };
}

export interface Slot {
  role: RaidRole;
  /** The spot this NPC stands at, before any idle wandering. */
  home: Vec2;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** A point `distance` from `origin`, at `angle` degrees from straight down (positive = right). */
function polar(origin: Vec2, distance: number, angleDegrees: number): Vec2 {
  const a = toRadians(angleDegrees);
  return { x: origin.x + distance * Math.sin(a), y: origin.y + distance * Math.cos(a) };
}

/**
 * Works out where every NPC stands: each group fans out in an arc around the boss at the distance
 * set in ROLE_LAYOUT, then the whole set is pushed apart so that no two icons overlap (leaving
 * room for idle wandering), nothing sits on the boss, and everyone is inside the arena.
 *
 * A group is normally one role. Roles that share a `cluster` in ROLE_LAYOUT (healers and
 * ranged) form one group together, using the layout of the first of them.
 */
export function computeSlots(input: LayoutInput): Slot[] {
  const { boss, bossRadius, npcRadius } = input;
  const slots: Slot[] = [];

  for (const members of groupRoles(input.roles)) {
    const layout = ROLE_LAYOUT[members[0]!];
    const distance = bossRadius + npcRadius + layout.gap;
    const centerAngle = layout.oppositeTo
      ? ROLE_LAYOUT[layout.oppositeTo].centerAngle + 180
      : layout.centerAngle;
    const total = members.length;
    // A group is either fanned over a fixed angle, or packed a fixed distance apart (`spacing`),
    // which keeps it the same tightness however far from the boss it stands.
    const arc =
      layout.spacing !== undefined
        ? ((total - 1) * layout.spacing * 180) / (Math.PI * distance)
        : (layout.arc ?? 0);

    members.forEach((role, index) => {
      const angle = total === 1 ? centerAngle : centerAngle + arc * (index / (total - 1) - 0.5);
      slots.push({ role, home: polar(boss, distance, angle) });
    });
  }

  separate(slots, input);
  return slots;
}

/**
 * Splits the NPCs into groups that stand together, each listed left to right. Roles that share
 * a `cluster` are merged into one group, mixed so the roles alternate (ranged, healer, ranged...)
 * rather than one role bunching at each end.
 */
function groupRoles(roles: readonly RaidRole[]): RaidRole[][] {
  const byGroup = new Map<string, Map<RaidRole, number>>();
  for (const role of roles) {
    const key = ROLE_LAYOUT[role].cluster ?? role;
    const counts = byGroup.get(key) ?? new Map<RaidRole, number>();
    counts.set(role, (counts.get(role) ?? 0) + 1);
    byGroup.set(key, counts);
  }

  return [...byGroup.values()].map((counts) => {
    // Most numerous role first, so it takes the outside positions in the mix.
    const queues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => Array<RaidRole>(count).fill(role));
    const mixed: RaidRole[] = [];
    while (queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        const next = queue.pop();
        if (next) mixed.push(next);
      }
    }
    return mixed;
  });
}

/** Nudges slots apart, away from the boss, and inside the arena, until nothing overlaps. */
function separate(slots: Slot[], { boss, bossRadius, npcRadius, arena }: LayoutInput): void {
  // Each NPC wanders up to IDLE_RADIUS from its slot, so slots need that much extra room.
  const room = (s: Slot): number => npcRadius + IDLE_RADIUS[s.role];

  for (let pass = 0; pass < 200; pass++) {
    let moved = false;

    for (let i = 0; i < slots.length; i++) {
      const a = slots[i]!;

      // Keep off the boss.
      const awayBoss = pushOut(a.home, boss, bossRadius + room(a));
      if (awayBoss) {
        a.home = awayBoss;
        moved = true;
      }

      for (let j = i + 1; j < slots.length; j++) {
        const b = slots[j]!;
        const needed = room(a) + room(b) + MIN_NPC_GAP;
        const dx = b.home.x - a.home.x;
        const dy = b.home.y - a.home.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= needed) continue;

        // Exactly stacked: pick a direction from the pair's indices so the result is repeatable.
        const nx = distance > 1e-6 ? dx / distance : Math.cos(i + j);
        const ny = distance > 1e-6 ? dy / distance : Math.sin(i + j);
        const push = (needed - distance) / 2 + 0.01;
        a.home = { x: a.home.x - nx * push, y: a.home.y - ny * push };
        b.home = { x: b.home.x + nx * push, y: b.home.y + ny * push };
        moved = true;
      }
    }

    for (const slot of slots) {
      const margin = room(slot) + ARENA_EDGE_MARGIN;
      const clamped = {
        x: Math.min(arena.width - margin, Math.max(margin, slot.home.x)),
        y: Math.min(arena.height - margin, Math.max(margin, slot.home.y)),
      };
      if (clamped.x !== slot.home.x || clamped.y !== slot.home.y) moved = true;
      slot.home = clamped;
    }

    if (!moved) return;
  }
}

/** If `point` is closer than `minDistance` to `center`, the nearest point that is not; else null. */
function pushOut(point: Vec2, center: Vec2, minDistance: number): Vec2 | null {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance) return null;
  if (distance < 1e-6) return { x: center.x, y: center.y + minDistance };
  return {
    x: center.x + (dx / distance) * minDistance,
    y: center.y + (dy / distance) * minDistance,
  };
}
