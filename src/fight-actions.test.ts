import { expect, it } from 'vitest';
import { fightActions } from './fight-actions';
import type { CombatState } from './combat';

it('describes resolved actions and their targets for all actors in a tick', () => {
  const fighters = [
    { id: 'c0', creature: { name: 'Ally' } },
    { id: 'e0', creature: { name: 'Mite' } },
    { id: 'e1', creature: { name: 'Wasp' } },
  ] as CombatState['fighters'];
  const event = (kind: string, actor: string, target: string, routine: string) => ({ t: 8, kind, actor, target, routine, amount: 1 });
  const events = [event('action', 'c0', 'c0', 'sweep'), event('damage', 'c0', 'e0', 'sweep'),
    event('damage', 'c0', 'e1', 'sweep'), event('action', 'e0', 'e0', 'strike'), event('damage', 'e0', 'c0', 'strike')];
  expect([...fightActions(fighters, events)]).toEqual([['c0', 'Acted: Sweep → Mite, Wasp'], ['e0', 'Acted: Strike → Ally']]);
  expect(fightActions(fighters, [])).toEqual(new Map());
});
