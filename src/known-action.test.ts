import { expect, it } from 'vitest';
import { createCombat } from './combat';
import { knownAction } from './known-action';
import type { Creature } from './types';

it('shows only actions already present in combat state, without predicting targets', () => {
  const creature = { id: 'x', name: 'Fighter', role: 'bruiser', tier: 'easy', routines: ['strike'] } as Creature;
  const state = createCombat([{ creature }], [creature], 1);
  const [crew, enemy] = state.fighters;
  expect(knownAction(state, enemy)).toBe('');
  state.queued = { actorId: crew.id, routineId: 'strike' };
  expect(knownAction(state, crew)).toBe('Queued: Strike');
  enemy.charging = true;
  expect(knownAction(state, enemy)).toBe('Charging: Charge (target undetermined)');
  crew.stunned = true;
  expect(knownAction(state, crew)).toBe('Stunned (turn skipped) · Queued: Strike');
  enemy.hp = 0;
  expect(knownAction(state, enemy)).toBe('');
});
