import type { CombatState, Fighter } from './combat';
import { ROUTINES } from './library';

/** Only state already committed by combat or the player; targets are selected on the turn. */
export function knownAction(state: CombatState, fighter: Fighter): string {
  if (fighter.hp <= 0) return '';
  const parts: string[] = [];
  if (fighter.stunned) parts.push('Stunned (turn skipped)');
  else if (fighter.charging) parts.push('Charging: Charge (target undetermined)');
  if (state.queued?.actorId === fighter.id) {
    const name = ROUTINES[state.queued.routineId]?.name;
    if (name) parts.push(fighter.charging && !fighter.stunned
      ? `Queued: ${name} (consumed by Charge unless stunned first)`
      : `Queued: ${name}`);
  }
  return parts.join(' · ');
}
