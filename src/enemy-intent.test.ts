import { expect, it } from 'vitest';
import { createCombat, step } from './combat';
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

it.each(['spawn', 'divide'])('shows strike when %s is exhausted, including on copies', id => {
  const creature = { id: 'x', name: 'Enemy', role: 'bruiser', tier: 'easy', routines: [id] } as Creature;
  let state = createCombat([{ creature }], [creature], 1);
  let enemy = state.fighters[1];
  if (id === 'divide') enemy.hp = Math.floor(enemy.maxHp * 0.4);
  expect(enemyIntent(state, enemy)).toBe(id === 'spawn' ? '✦ Spawn' : '✦ Divide');
  if (id === 'spawn') {
    enemy.summons = 1;
    expect(enemyIntent(state, enemy)).toBe('✦ Spawn');
  }
  enemy.nextAction = 1;
  state = step(state);
  enemy = state.fighters[1];
  const copy = state.fighters.find(f => f.summonedBy === enemy.id)!;
  expect(copy).toBeDefined();
  // Split's condition must also be true for the copy to select Divide.
  if (id === 'divide') copy.hp = Math.floor(copy.maxHp * 0.4);
  expect(enemyIntent(state, enemy)).toBe('⚔ Strike');
  expect(enemyIntent(state, copy)).toBe('⚔ Strike');
});
