import { expect, it } from 'vitest';
import { createCombat } from './combat';
import { upcomingAction } from './upcoming-action';
import type { Creature } from './types';

it('shows the next actor and only actions and targets already committed, updating when an order changes', () => {
  const creature = { id: 'x', name: 'Fighter', role: 'bruiser', tier: 'easy', routines: ['strike'] } as Creature;
  const state = createCombat([{ creature }], [creature], 1);
  expect(upcomingAction(state)).toBe('Crew: Fighter · Action: undecided · Target: undecided');
  state.queued = { actorId: state.fighters[0].id, routineId: 'strike' };
  expect(upcomingAction(state)).toBe('Crew: Fighter · Action: Strike (queued) · Target: undecided');
  state.fighters[0].charging = true;
  expect(upcomingAction(state)).toBe('Crew: Fighter · Action: Charge · Target: undecided');
  state.fighters[0].stunned = true;
  state.fighters[1].nextAction = 1;
  expect(upcomingAction(state)).toBe('Enemy: Fighter · Action: undecided · Target: undecided');
});
