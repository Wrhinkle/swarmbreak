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

import { createCombat } from '../src/combat';
import { NO_BUILD, play } from './sim';

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

describe('simulation upgrades', () => {
  it('keeps Sweep conditional instead of upgrading it to a weaker single-target attack', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    run.crew = [{ ...run.crew[0], id: 'sweeper', routines: ['sweep', 'strike'] }];
    const act = run.acts[0];
    const fight = { ...act.nodes.find(n => n.encounter?.length)!, id: 'fight', floor: 1, next: [] };
    const rest = { ...fight, id: 'rest', floor: 0, kind: 'rest' as const, encounter: undefined, next: ['fight'] };
    act.nodes = [rest, fight];
    vi.mocked(createCombat).mockClear();
    play(run, () => 0, { ...NO_BUILD, build: 'heuristic' });
    const loadout = vi.mocked(createCombat).mock.calls[0][0][0].creature.routines;
    expect(loadout).toEqual(['sweep', 'strike+']);
  });
});
