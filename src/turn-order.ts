import type { Fighter } from './combat';

/** Scheduled turns can change if a fighter is defeated or stunned before acting. */
export function turnOrder(fighters: Fighter[], tick: number): Fighter[] {
  const nextPossibleAction = (f: Fighter) => Math.max(tick + 1, f.nextAction) + (f.stunned ? f.speed : 0);
  return fighters.filter(f => f.hp > 0).sort((a, b) =>
    nextPossibleAction(a) - nextPossibleAction(b));
}
