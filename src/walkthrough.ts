import type { Save } from './save';

/** Record the walkthrough when it opens, so resuming a run does not interrupt play. */
export function markWalkthroughSeen(save: Save): void {
  save.walkthroughSeen = true;
}

/** Explain the active time battle and Auto without changing combat. */
export const fightExplanation = 'Fighters act when ready; their speed determines how often they act. When one of your crew is ready, the fight waits for you. Pause or change the speed whenever you need.';
export const orderExplanation = 'Choose an action for the ready crew member, then a target if it needs one. Auto follows that fighter’s routines instead, and their attacks pick the enemy with the lowest HP. Turn on Auto battle to let the whole crew fight on their routines.';
