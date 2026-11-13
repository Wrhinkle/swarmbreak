import type { Fighter } from './combat';

/** Scheduled turns can change if a fighter is defeated or stunned before acting. */
export function turnOrder(fighters: Fighter[], tick: number): Fighter[] {
  return fighters.filter(f => f.hp > 0).sort((a, b) =>
    Math.max(tick + 1, a.nextAction) - Math.max(tick + 1, b.nextAction));
}
