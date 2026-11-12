import type { CombatState } from './combat';
import { ROUTINES } from './library';

/** Describe only actions and targets already resolved by combat. */
export function fightActions(fighters: CombatState['fighters'], events: CombatState['events']): Map<string, string> {
  const names = new Map(fighters.map(f => [f.id, f.creature.name]));
  const actions = new Map<string, { tick: number; routine: string; targets: Set<string> }>();
  let current: { actor: string; tick: number; routine: string; targets: Set<string> } | undefined;
  for (const event of events) {
    if (event.kind === 'action') {
      // Mirror emits a nested action for the same routine; keep its effects together.
      if (!current || current.actor !== event.actor || current.tick !== event.t || current.routine !== event.routine) {
        current = { actor: event.actor, tick: event.t, routine: event.routine, targets: new Set() };
        actions.set(event.actor, current);
      }
    } else if (current && event.t === current.tick && event.actor === current.actor && event.routine === current.routine && event.kind !== 'death') {
      const target = names.get(event.target);
      if (target) current.targets.add(target);
    }
  }
  return new Map([...actions].map(([actor, action]) => [actor,
    `Acted: ${ROUTINES[action.routine]?.name ?? action.routine}${action.targets.size ? ` → ${[...action.targets].join(', ')}` : ''}`]));
}
