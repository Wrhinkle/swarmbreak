import type { Save } from './save';

/** Record the walkthrough when it opens, so resuming a run does not interrupt play. */
export function markWalkthroughSeen(save: Save): void {
  save.walkthroughSeen = true;
}

/** Explain the current automatic fight and manual override without changing combat. */
export const fightExplanation = 'Fighters act automatically when ready; their speed determines how often they act. Most attacks choose the enemy with the lowest HP. Pause or change the speed whenever you need.';
export const orderExplanation = 'To give an order, choose a crew member and a routine, then press Queue order. A queued routine ignores its condition and starts a shared cooldown when used. Stun skips the fighter’s next action but leaves the order queued. If the fighter is already charging, they complete Charge instead, consuming the order and starting the shared cooldown. The order can be lost if the fighter dies or the fight ends.';
