import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chooseAtb, createCombat, enableAtb, simulate } from '../src/combat';
import { newSave, parseSave } from '../src/save';
import type { Run } from '../src/types';
import { EXPERT, NOVICE, playCombat, rankAttackTargets } from './sim';

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
  it('uses a stronger equipped attack even when it follows Strike', () => {
    const ally = { ...run.crew[0], routines: ['strike', 'finish'] };
    const state = createCombat([{ creature: ally }], [enemy], run.seed);
    state.fighters[0].nextAction = 1;
    state.fighters[1].nextAction = 100;
    const end = playCombat(state, EXPERT);
    expect(end.atb!.choices[0].routineId).toBe('finish');
  });
  it('uses Breach over Strike when both are equipped', () => {
    const ally = { ...run.crew[0], routines: ['strike', 'breach'] };
    const state = createCombat([{ creature: ally }], [enemy], run.seed);
    state.fighters[0].nextAction = 1;
    state.fighters[1].nextAction = 100;
    const end = playCombat(state, EXPERT);
    expect(end.atb!.choices[0].routineId).toBe('breach');
  });
  it('uses Breach against a shielded enemy even when a heavy attack comes first', () => {
    const ally = { ...run.crew[0], routines: ['finish', 'breach'] };
    const state = createCombat([{ creature: ally }], [enemy], run.seed);
    state.fighters[0].nextAction = 1;
    state.fighters[1].nextAction = 100;
    state.fighters[1].shield = 100;
    const end = playCombat(state, EXPERT);
    expect(end.atb!.choices[0].routineId).toBe('breach');
  });
  it('uses Breach to finish a shielded enemy before attacking a healthier one', () => {
    const ally = { ...run.crew[0], routines: ['breach'] };
    const target = { ...enemy, routines: ['strike'] };
    const state = createCombat([{ creature: ally }], [target, target], run.seed);
    state.fighters[0].nextAction = 1;
    state.fighters.slice(1).forEach(f => { f.nextAction = 100; });
    state.fighters[1].hp = 1; state.fighters[1].shield = 100;
    state.fighters[2].hp = Math.round(state.fighters[0].power * 1.5) + 1;
    expect(rankAttackTargets(state.fighters.slice(1), 'breach')[0].id).toBe('e0');
  });
  it('replays a full manual fight across saves at every decision', () => {
    const expected = playCombat(fight(), EXPERT);
    const choices = expected.atb!.choices;
    expect(choices.filter(c => c.targetId).length).toBeGreaterThan(1);
    const save = newSave();
    save.today = { runId: run.id, node: null, cleared: [], crew: run.crew.map(creature => ({ creature, hp: 1, routines: creature.routines, slots: 3, recruited: false, active: true })), deck: run.crew.flatMap(c => c.routines), gold: 0, seed: run.seed, result: null };
    let state = enableAtb(fight()), index = 0;
    while (!state.result) {
      state = simulate(state, 3000);
      if (!state.atb!.pending) break;
      save.today.combat = state;
      state = parseSave(JSON.stringify(save)).today!.combat!;
      const choice = choices[index++];
      expect(state.atb!.pending).toBe(choice.actorId);
      state = chooseAtb(state, choice.actorId, choice.routineId, choice.targetId);
      save.today.combat = state;
      state = parseSave(JSON.stringify(save)).today!.combat!;
    }
    expect(index).toBe(choices.length);
    expect(state).toEqual(expected);
  });
});
