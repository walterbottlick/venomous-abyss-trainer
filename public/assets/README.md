# Game art

Everything here is served as-is by Vite and loaded by Phaser at runtime (for example `this.load.image('vashnik-bg', 'assets/bosses/vashnik-the-malignant/background.png')`).

## Folder layout

```
public/assets/
  bosses/
    <encounter-id>/            one folder per encounter; ids match src/bosses/registry.ts
      background.png           the arena
      background-<name>.png    extra arenas, for fights where the room changes (Ula'tek)
      boss/                    every boss in the encounter, plus the encounter's menu icon
      minions/                 adds and other enemies
      objects/                 anything else in the fight
  icons/
    classes/                   one icon per class
    roles/                     generic role icons
    markers/                   raid target markers
```

Encounter folders: `nymrissa-wavecaller`, `nekzali-the-soulcoiler`, `entombed-sentinels`, `vashnik-the-malignant`, `the-lost-explorers`, `sszorak`, `the-twin-fangs`, `the-coiled-altar`, `ulatek`.

## Encounters vs. bosses

The folder is named for the **encounter** (what shows in the boss menu), which is not always the name of the boss you fight. Some encounters have several bosses:

| Encounter | Bosses (files in `boss/`) |
| --- | --- |
| The Lost Explorers | `first-mate-nama`, `morzahi`, `scrollsage-iku`, `trader-gebbo` |
| The Twin Fangs | `ithraz`, `vexhul` |
| The Coiled Altar | `hex-lord-malacrass`, `zuljan` |
| Entombed Sentinels | `blood-of-ulatek`, `breath-of-ulatek` |

Each `boss/` folder also holds `<encounter-id>-icon.jpg`, the small icon used for that encounter in menus. It is not a boss sprite.

### Ula'tek's backgrounds

The arena changes during the fight, so `ulatek/` has several backgrounds: `background.png` (the starting room), `background-left-corridor.png`, `background-right-corridor.png`, and `background-broken.png`.

## Naming

Lowercase, words separated by hyphens, no spaces. The name is the asset's identity in code, so keep it descriptive and stable (`void-orb.png`, not `Image 12 (final).png`). If a thing has several states, suffix them: `vashnik-phase-2.png`, `poison-pool-active.png`.

- **Class icons:** `icons/classes/<class-id>.jpeg`, with ids `death-knight`, `demon-hunter`, `druid`, `evoker`, `hunter`, `mage`, `monk`, `paladin`, `priest`, `rogue`, `shaman`, `warlock`, `warrior`.
- **Role icons:** `icons/roles/<role>.png`: `tank`, `healer`, `melee-dps`, `ranged-dps`.
- **Target markers:** `icons/markers/<name>.png`: `star`, `circle`, `diamond`, `triangle`, `moon`, `square`, `cross`, `skull`.

## Format and size

Current art, for reference:

- **Backgrounds:** PNG, 1114x870 (about 1.28:1, so they are not square).
- **Boss, minion, and object sprites:** PNG, 256x256, drawn as circular portraits.
- **Encounter icons and a few objects** (`crate`, `mushroom`): JPG, 56x56.
- **Class icons:** JPEG, 100x100 (evoker is 128x128).
- **Role icons:** PNG, 50x50. **Markers:** PNG, about 62x62.

The game renders at 2x, so art looks sharpest when it is at least twice its on-screen size. Small icons shown larger than about half their pixel size will look soft.

Empty folders contain a `.gitkeep` file so git tracks them. It's safe to delete once a folder has real files.
