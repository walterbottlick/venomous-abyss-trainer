import type { BossDefinition } from './types';

/** In raid order. A boss with no `sceneKey` shows as "coming soon" in the menu. */
export const BOSSES: BossDefinition[] = [
  { id: 'nymrissa-wavecaller', name: 'Nymrissa Wavecaller' },
  { id: 'nekzali-the-soulcoiler', name: "Nek'zali the Soulcoiler" },
  { id: 'entombed-sentinels', name: 'Entombed Sentinels' },
  { id: 'vashnik-the-malignant', name: 'Vashnik the Malignant', sceneKey: 'VashnikScene' },
  { id: 'the-lost-explorers', name: 'The Lost Explorers' },
  { id: 'sszorak', name: 'Sszorak' },
  { id: 'the-twin-fangs', name: 'The Twin Fangs' },
  { id: 'the-coiled-altar', name: 'The Coiled Altar' },
  { id: 'ulatek', name: "Ula'tek" },
];
