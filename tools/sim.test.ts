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

describe('simulation equipment', () => {
  it('buys and equips Breach for a reachable shielded fight', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    run.crew = [{ ...run.crew[0], role: 'bruiser', routines: ['sweep', 'strike'] }];
    const act = run.acts[0];
    const enemy = { ...act.creatures[0], id: 'shielded', routines: ['brace', 'strike'] };
    act.creatures = [enemy];
    const fight = { ...act.nodes.find(n => n.encounter?.length)!, id: 'fight', floor: 2, encounter: [enemy.id], next: [], hidden: false };
    const shop = { ...fight, id: 'shop', floor: 1, kind: 'shop' as const, encounter: undefined, next: ['fight'] };
    const event = { ...shop, id: 'event', floor: 0, kind: 'event' as const, eventId: 'gold', next: ['shop'] };
    act.nodes = [event, shop, fight];
    act.shop = ['breach'];
    act.events = [{ id: 'gold', name: 'Gold', text: '', options: [{ text: 'Take', effect: { type: 'gold', amount: 100 } }] }];
    vi.mocked(createCombat).mockClear();
    play(run, () => 0, { ...NO_BUILD, build: 'search', care: 1, noise: 0 });
    expect(vi.mocked(createCombat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createCombat).mock.calls[0][0][0].creature.routines).toEqual(['breach', 'sweep', 'strike']);
  });
  it('does not equip Wide Sweep from the pool during preparation', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    run.crew = [{ ...run.crew[0], role: 'bruiser', routines: ['sweep', 'strike'] }];
    const act = run.acts[0];
    const fight = { ...act.nodes.find(n => n.encounter?.length)!, id: 'fight', floor: 1, next: [] };
    const event = { ...fight, id: 'event', floor: 0, kind: 'event' as const, encounter: undefined, eventId: 'wide-sweep-event', next: ['fight'] };
    act.nodes = [event, fight];
    act.events = [{ id: 'wide-sweep-event', name: 'Reward', text: '', options: [{ text: 'Take', effect: { type: 'routine', id: 'sweep+' } }] }];
    vi.mocked(createCombat).mockClear();
    play(run, () => 0, { ...NO_BUILD, build: 'search', care: 1, noise: 0 });
    expect(vi.mocked(createCombat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createCombat).mock.calls[0][0][0].creature.routines).toEqual(['sweep', 'strike']);
  });

  it('equips a stronger basic attack without previewing combat', () => {
    const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
    run.acts = [run.acts[0]];
    run.crew = [{ ...run.crew[0], role: 'bruiser', routines: ['sweep', 'strike'] }];
    const act = run.acts[0];
    const fight = { ...act.nodes.find(n => n.encounter?.length)!, id: 'fight', floor: 1, next: [] };
    act.nodes = [{ ...fight, id: 'event', floor: 0, kind: 'event', encounter: undefined, eventId: 'reward', next: ['fight'] }, fight];
    act.events = [{ id: 'reward', name: 'Reward', text: '', options: [{ text: 'Take', effect: { type: 'routine', id: 'strike+' } }] }];
    vi.mocked(createCombat).mockClear();
    play(run, () => 0, { ...NO_BUILD, build: 'search', care: 1, noise: 0 });
    expect(vi.mocked(createCombat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createCombat).mock.calls[0][0][0].creature.routines).toEqual(['sweep', 'strike+', 'strike']);
  });

});
