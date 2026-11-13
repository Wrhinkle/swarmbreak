import { condition } from './combat';
import type { CombatState, Fighter } from './combat';
import { ROUTINES } from './library';

/** The current choice can change before this fighter's turn. */
export function enemyIntent(state: CombatState, fighter: Fighter): string {
  if (fighter.hp <= 0) return '';
  if (fighter.stunned) return '💫 Stunned (turn skipped)';
  const routine = fighter.charging ? ROUTINES.charge :
    fighter.routines.map(id => ROUTINES[id]).find(r => r && condition(state, fighter, r)) ?? ROUTINES.strike;
  const icon = ['patch', 'mend_all'].includes(routine.action) ? '✚' :
    ['guard_self', 'guard_ally'].includes(routine.action) ? '🛡' :
    ['summon', 'split'].includes(routine.action) ? '✦' : '⚔';
  return `${icon} ${routine.name}`;
}
