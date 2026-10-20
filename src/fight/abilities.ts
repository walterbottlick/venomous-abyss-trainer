import type { PlayerChoice } from '../game/player';
import { rangeMetersFor } from './ranges';

/**
 * The lines in the side panel that tell the player what their role can do. Healers heal and
 * dispel with the mouse; DPS attack on their own as long as they are in range.
 */
export function abilityLines(choice: PlayerChoice): string[] {
  if (choice.role === 'healer') return ['Left click: Heal', 'Right click: Dispel'];
  const range = rangeMetersFor(choice.classId, choice.range ?? 'ranged');
  return [`Stay in range to auto-attack. Range: ${range}m`];
}
