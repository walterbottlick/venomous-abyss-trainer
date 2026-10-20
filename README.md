# Venomous Abyss Trainer

A training game to learn the mechanics and strategies for the boss fights in the Mythic Venomous Abyss raid for WoW.

It is a light top-down 2D browser game, in the spirit of an old Flash game. The player moves around a small arena and occasionally presses keys or clicks things to practice and react to each boss's mechanics. It is not meant to simulate playing WoW or practicing class rotations.

## Stack

- TypeScript (strict), Vite
- [Phaser](https://phaser.io) for the game canvas, scenes, input, and timers
- Vitest for tests, ESLint and Prettier for code quality

## Getting started

```bash
npm install
npm run dev
```

| Script           | What it does                        |
| ---------------- | ----------------------------------- |
| `npm run dev`    | Start the dev server                |
| `npm run build`  | Type-check and build for production |
| `npm test`       | Run unit tests once                 |
| `npm run lint`   | Lint the project                    |
| `npm run format` | Format with Prettier                |

## Layout

The game is a fixed 960x540 canvas, scaled to fit the window: a 690x540 arena on the left (the same shape as the arena art, so backgrounds are never cropped) and a 270px side panel for menus and HUD on the right.

```
src/
  main.ts          Phaser game config and scene list
  game/            Engine-agnostic logic (movement, classes, config); unit-tested
  scenes/          Menu scenes: role, melee/ranged, class, boss select
  assets/          Asset keys and paths, and the loader for shared menu art
  ui/              Shared UI helpers (buttons, loading bar, camera setup)
  raid/            NPC raid members: composition, layout, idle wander; all tunables in raid/config.ts
  bosses/
    registry.ts    Ordered list of all bosses (unbuilt ones show as "soon")
    types.ts       Boss definition and scene data types
    <boss>/        One self-contained folder per boss fight
public/assets/     PNG/JPG art; see public/assets/README.md for layout and naming
```

Encounter logic (timings, rules, win/fail) is kept as plain TypeScript separate from rendering, so it can be unit-tested without launching the game.

## Menu flow

Role (healer / DPS) → melee or ranged (DPS only) → class icon → boss select → fight.

See [ROADMAP.md](ROADMAP.md) for what is planned.
