import { expect, it } from 'vitest';
import { turnOrder } from './turn-order';
import type { Fighter } from './combat';

it('orders living fighters by their next scheduled turn, preserving combat order for ties', () => {
  const fighters = [
    { id: 'late', hp: 3, nextAction: 9 },
    { id: 'ready-first', hp: 1, nextAction: 2 },
    { id: 'down', hp: 0, nextAction: 1 },
    { id: 'ready-second', hp: 1, nextAction: 3 },
    { id: 'tie', hp: 1, nextAction: 9 },
  ] as Fighter[];
  expect(turnOrder(fighters, 4).map(f => f.id)).toEqual(['ready-first', 'ready-second', 'late', 'tie']);
  expect(fighters.map(f => f.id)).toEqual(['late', 'ready-first', 'down', 'ready-second', 'tie']);
});
