import { expect, it } from 'vitest';
import { createCombat } from './combat';
import { enemyIntent } from './enemy-intent';
import type { Creature } from './types';

it('shows the current applicable routine, updating with conditions and special states', () => {
  const creature = { id: 'x', name: 'Enemy', role: 'bruiser', tier: 'easy', routines: ['breach', 'strike'] } as Creature;
  const state = createCombat([{ creature }], [creature], 1);
  const [crew, enemy] = state.fighters;
  expect(enemyIntent(state, enemy)).toContain('Strike');
  crew.shield = 5;
  expect(enemyIntent(state, enemy)).toContain('Breach');
  enemy.charging = true;
  expect(enemyIntent(state, enemy)).toContain('Charge');
  enemy.stunned = true;
  expect(enemyIntent(state, enemy)).toContain('Stunned');
  enemy.hp = 0;
  expect(enemyIntent(state, enemy)).toBe('');
});
