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

it('orders stunned fighters by their next possible action and updates when stun changes', () => {
  const fighters = [
    { id: 'stunned', hp: 1, nextAction: 2, speed: 4, stunned: true },
    { id: 'other', hp: 1, nextAction: 5, speed: 4, stunned: false },
  ] as Fighter[];
  expect(turnOrder(fighters, 0).map(f => f.id)).toEqual(['other', 'stunned']);
  fighters[0].stunned = false;
  expect(turnOrder(fighters, 0).map(f => f.id)).toEqual(['stunned', 'other']);
});

it('uses the next tick for overdue skipped turns and roster order for action ties', () => {
  const fighters = [
    { id: 'stunned', hp: 1, nextAction: 1, speed: 3, stunned: true },
    { id: 'tie', hp: 1, nextAction: 8, speed: 3, stunned: false },
    { id: 'earlier', hp: 1, nextAction: 7, speed: 3, stunned: false },
  ] as Fighter[];
  expect(turnOrder(fighters, 4).map(f => f.id)).toEqual(['earlier', 'stunned', 'tie']);
});
