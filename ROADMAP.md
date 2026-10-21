# Roadmap

## Done

- [x] Project scaffold: Vite, TypeScript strict, Phaser, Vitest, ESLint, Prettier
- [x] Menu flow: role → melee/ranged → class → boss select
- [x] Boss registry with all 9 bosses (only Vashnik is playable so far)
- [x] 690x540 arena + side panel layout, WASD and arrow key movement
- [x] Game art uploaded; menus use class, role, and encounter icons; Vashnik shows its background and boss portrait
- [x] NPC raid members (2 tanks, 2 healers, 3 melee, 3 ranged, minus the player): placed around the boss, idle wandering, ready to follow the boss
- [x] Health rings, healing (click) and dispelling (right-click), NPC death, fight log, wipe screen, boss health and enrage, and Shift+Alt+0-9 testing shortcuts
- [x] DPS auto-attacks (1 damage per second each, in range of the boss, measured in meters), attack animations, and ability text in the side panel
- [x] Every fight: raid starts huddled at the bottom, 3-2-1 countdown, boss runs at the tanks and is moved into position
- [x] Vashnik: acid pool, Imbibe, Shrouded and Burning Venom (focus, death grip, banish), purple circles

## Next: Vashnik the Malignant (about 6 mechanics, TBD)

- [ ] List and describe each mechanic
- [ ] Encounter timeline (plain TypeScript, unit-tested)
- [ ] Reusable mechanic building blocks (ground zones, soaks, clickable adds, etc.)
- [ ] Win / fail feedback that explains what went wrong, with a quick restart
- [ ] Place minions, totem, and other fight objects

## Later

- [ ] Ula'tek: switch between its four backgrounds as the fight progresses
- [ ] Remaining bosses, in order: Nymrissa Wavecaller, Nek'zali the Soulcoiler, Entombed Sentinels, The Lost Explorers, Sszorak, The Twin Fangs, The Coiled Altar, Ula'tek
- [ ] Deploy (GitHub Pages / itch.io / Vercel)
- [ ] Sound
