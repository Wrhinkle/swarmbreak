import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCombat, simulate } from '../src/combat';
import type { Run } from '../src/types';
import { EXPERT, NOVICE, playCombat } from './sim';

describe('ATB bot decisions', () => {
  const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8')) as Run;
  const enemy = run.acts[0].creatures.find(c => run.acts[0].nodes.some(n => n.encounter?.includes(c.id)))!;
  const fight = () => createCombat(run.crew.map(creature => ({ creature })), [enemy], run.seed);
  it('chooses Auto at each decision and matches the original automatic fight', () => {
    const end = playCombat(fight(), NOVICE);
    expect(end.atb!.choices.length).toBeGreaterThan(0);
    expect(end.atb!.choices.every(c => c.routineId === 'auto')).toBe(true);
    const { atb: _atb, ...automatic } = end;
    expect(automatic).toEqual(simulate(fight(), 3000));
  });
  it('records player-selectable actions and produces deterministic results', () => {
    const end = playCombat(fight(), EXPERT);
    expect(end.atb!.choices.some(c => c.routineId !== 'auto')).toBe(true);
    expect(playCombat(fight(), EXPERT)).toEqual(end);
  });
});
