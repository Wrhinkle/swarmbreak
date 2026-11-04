import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Run } from '../src/types';

vi.mock('../src/combat', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/combat')>();
  return {
    ...actual,
    createCombat: vi.fn(actual.createCombat),
    simulate: vi.fn((state: ReturnType<typeof actual.createCombat>) => {
      const crew = state.fighters.filter(f => f.side === 'crew');
      if (crew.some(f => f.creature.id === 'starter-0')) crew[0].hp = 0;
      return { ...state, result: 'win' as const, goldStolen: 0 };
    }),
  };
});

import { createCombat, simulate } from '../src/combat';
import { NO_BUILD, TYPICAL, play } from './sim';

describe('simulation reserves', () => {
  it('brings a healthy recruit into the next fight without routine edits', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    run.crew = Array.from({ length: 4 }, (_, i) => ({ ...run.crew[0], id: `starter-${i}` }));
    const act = run.acts[0];
    const recruit = { ...run.crew[0], id: 'recruit' };
    act.creatures.push(recruit);
    const first = { ...act.nodes.find(n => n.encounter?.length)!, id: 'first', floor: 0, next: ['second'], reward: recruit.id };
    const second = { ...first, id: 'second', floor: 1, next: [], reward: undefined };
    act.nodes = [first, second];
    vi.mocked(createCombat).mockClear();
    expect(play(run, () => 0, NO_BUILD).won).toBe(true);
    const fights = vi.mocked(createCombat).mock.calls;
    expect(fights).toHaveLength(2);
    expect(fights[1][0].map(member => member.creature.id)).toEqual(['starter-1', 'starter-2', 'starter-3', 'recruit']);
  });
});

it('keeps the existing routine order when automatic equipment makes the fight worse', () => {
  const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
  run.acts = [run.acts[0]];
  run.crew = [{ ...run.crew[0], routines: ['strike+', 'finish'] }];
  const fight = run.acts[0].nodes.find(n => n.encounter?.length)!;
  run.acts[0].nodes = [{ ...fight, floor: 0, next: [] }];
  vi.mocked(simulate).mockImplementation(state => {
    const crew = state.fighters.find(f => f.side === 'crew')!;
    if (crew.routines[0] === 'finish') crew.hp = 0;
    return { ...state, result: 'win', goldStolen: 0 };
  });
  vi.mocked(createCombat).mockClear();
  play(run, () => 0, { ...TYPICAL, care: 0 });
  const calls = vi.mocked(createCombat).mock.calls;
  expect(calls[calls.length - 1][0][0].creature.routines).toEqual(['strike+', 'finish']);
});

it('checks routine order for a boss even when the bot skips ordinary preparation', () => {
  const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
  run.acts = [run.acts[0]];
  run.crew = [{ ...run.crew[0], routines: ['finish', 'strike+'] }];
  const fight = run.acts[0].nodes.find(n => n.encounter?.length)!;
  run.acts[0].nodes = [{ ...fight, kind: 'boss', floor: 0, next: [] }];
  vi.mocked(simulate).mockImplementation(state => {
    const crew = state.fighters.find(f => f.side === 'crew')!;
    if (crew.routines[0] === 'finish') crew.hp = 0;
    return { ...state, result: 'win', goldStolen: 0 };
  });
  vi.mocked(createCombat).mockClear();
  play(run, () => 0, { ...TYPICAL, care: 0 });
  const calls = vi.mocked(createCombat).mock.calls;
  expect(calls[calls.length - 1][0][0].creature.routines).toEqual(['strike+', 'finish']);
});
