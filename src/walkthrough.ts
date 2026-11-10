import type { Save } from './save';

/** Record the walkthrough when it opens, so resuming a run does not interrupt play. */
export function markWalkthroughSeen(save: Save): void {
  save.walkthroughSeen = true;
}
