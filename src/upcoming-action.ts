import type { CombatState } from './combat';
import { ROUTINES } from './library';
import { turnOrder } from './turn-order';

/** Display only commitments in the state; combat chooses targets when acting. */
export function upcomingAction(state: CombatState): string {
  const fighter = turnOrder(state.fighters, state.t)[0];
  if (!fighter) return 'No upcoming actor';
  const queued = state.queued?.actorId === fighter.id ? ROUTINES[state.queued.routineId] : undefined;
  const action = fighter.charging && !fighter.stunned ? 'Charge' : queued ? `${queued.name} (queued)` : 'undecided';
  return `${fighter.side === 'crew' ? 'Crew' : 'Enemy'}: ${fighter.creature.name} · Action: ${action} · Target: undecided`;
}
