import type { Save } from './save';

/** Record the walkthrough when it opens, so resuming a run does not interrupt play. */
export function markWalkthroughSeen(save: Save): void {
  save.walkthroughSeen = true;
}

/** Explain the current automatic fight and manual override without changing combat. */
export const fightExplanation = 'Fighters act automatically when ready; their speed determines how often they act. Most attacks choose the enemy with the lowest HP. Queue a crew member’s routine to use it on their next turn, even if its condition is unmet; orders share a cooldown. Pause or change the speed whenever you need.';
