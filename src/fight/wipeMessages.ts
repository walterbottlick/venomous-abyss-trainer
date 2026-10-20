/** Why a fight ended in a wipe. */
export type WipeReason =
  'player-died' | 'both-tanks-died' | 'tank-died' | 'healers-died' | 'dps-died' | 'enrage';

/**
 * The message shown on the wipe screen, by reason. Each reason has a list; one is picked at
 * random, so to add a new message just add another string to the right list.
 *
 * 'player-died' always wins when several reasons happen together, and is the only list a player
 * death ever draws from (never the NPC or enrage messages).
 */
export const WIPE_MESSAGES: Record<WipeReason, string[]> = {
  'player-died': ['You died! Minus 50 DKP!'],
  'tank-died': ["You got the tank killed! The other one can't do it alone!"],
  'both-tanks-died': [
    "You somehow killed both tanks in a game I designed to end after losing one. You're either really bad at this or extremely good.",
  ],
  'healers-died': [
    "All healers are dead! Vampiric Embrace isn't strong enough to make up the difference!",
  ],
  'dps-died': [
    'All DPS are dead! They may be mouthbreathers, but you still (theoretically) need them!',
  ],
  enrage: [
    "The boss is enraged! Sure, you could try to keep going and hope you kill it, but I'm just going to force you to wipe.",
  ],
};

/** Picks a message for `reason`. `random` returns a number in [0, 1). */
export function pickWipeMessage(reason: WipeReason, random: () => number = Math.random): string {
  const messages = WIPE_MESSAGES[reason];
  return messages[Math.floor(random() * messages.length)] ?? '';
}

/** Wipe reasons from most to least important, for when several happen at once. */
export const WIPE_PRIORITY: readonly WipeReason[] = [
  'player-died',
  'both-tanks-died',
  'tank-died',
  'healers-died',
  'dps-died',
  'enrage',
];
