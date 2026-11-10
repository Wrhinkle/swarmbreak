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
import { EXPERT, NO_BUILD, play } from './sim';

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

  it('routes to the lighter of two fights the map shows, and ignores a mystery room\'s enemies', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    const act = run.acts[0], fight = act.nodes.find(n => n.kind === 'fight' && n.encounter?.length)!, foe = fight.encounter![0];
    const room = (id: string, count: number, hidden = false) => ({ ...fight, id, floor: 0, next: [], hidden, reward: undefined, encounter: Array<string>(count).fill(foe) });
    const fought = (nodes: typeof act.nodes) => { act.nodes = nodes; vi.mocked(createCombat).mockClear(); play(run, () => 0, { ...EXPERT, build: 'none' }); return vi.mocked(createCombat).mock.calls[0][1].length; };
    expect(fought([room('heavy', 3), room('light', 1)])).toBe(1);
    expect(fought([room('light', 1), room('heavy', 3)])).toBe(1);
    expect(fought([room('even', 2), room('unseen', 1, true)])).toBe(1); // the mystery room wins on its own bonus, not on its enemies
  });

  it('avoids a forced heavy successor but treats its hidden contents as unknown', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    const act = run.acts[0], fight = act.nodes.find(n => n.kind === 'fight' && n.encounter?.length)!, foe = fight.encounter![0];
    const heavy = { ...fight, id: 'heavy', floor: 1, next: [], reward: undefined, hidden: false, encounter: Array<string>(3).fill(foe) };
    const light = { ...heavy, id: 'light', encounter: [foe] };
    const start = (id: string, next: string) => ({ ...fight, id, floor: 0, kind: 'rest' as const, next: [next], hidden: false, encounter: undefined, reward: undefined });
    const choose = () => play(run, () => 0, { ...EXPERT, build: 'none' }).route[0];
    act.nodes = [start('toward-heavy', heavy.id), start('toward-light', light.id), heavy, light];
    expect(choose()).toBe('toward-light');
    heavy.hidden = true;
    expect(choose()).toBe('toward-heavy');
    heavy.encounter = [foe];
    expect(choose()).toBe('toward-heavy');
  });
});
