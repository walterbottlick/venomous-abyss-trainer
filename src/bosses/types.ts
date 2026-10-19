import type { PlayerChoice } from '../game/player';

export interface BossDefinition {
  id: string;
  name: string;
  /** Phaser scene key started when the boss is picked. Omitted until the fight is built. */
  sceneKey?: string;
}

/** Data handed to every boss scene when it starts. */
export interface BossSceneData {
  choice: PlayerChoice;
}
