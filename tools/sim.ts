// Plays a built run with two bots and prints win rates, so a run can't ship unbeatable or trivial.
// Usage: npx vite-node tools/sim.ts public/runs/<id>/run.json [runs]
import { readFileSync } from 'node:fs';
import { createCombat, fighter, simulate } from '../src/combat';
import { CREW_MAX, ROUTINES, SLOTS_MAX, SLOTS_START } from '../src/library';
import type { Creature, MapNode, Run } from '../src/types';

interface Member { creature: Creature; hp: number; max: number; routines: string[]; slots: number; active: boolean }
export interface RunResult { won: boolean; floor: number; lostTo?: string; ticks: number }

export function play(run: Run, random: () => number, strong: boolean): RunResult {
  const member = (c: Creature, active: boolean): Member => { const max = fighter(c, 'crew', 'x').maxHp; return { creature: c, hp: max, max, routines: c.routines.slice(0, SLOTS_START), slots: SLOTS_START, active }; };
  const crew = run.crew.map(c => member(c, true));
  let gold = 0, ticks = 0, floor = 0;
  const health = () => { const up = crew.filter(c => c.active); return up.reduce((n, c) => n + c.hp / c.max, 0) / up.length; };
  const learn = (id: string) => {
    if (!strong) return; // ponytail: the novice never edits routines, which is the floor we're measuring
    // ponytail: a fixed sensible build, not a search; the upper bound will rise once a bot tries real loadouts
    const heals = ['patch', 'patch+', 'triage'].includes(id), hits = ['finish', 'breach', 'strike+', 'sweep', 'sweep+'].includes(id);
    if (!heals && !hits) return;
    const m = crew.filter(c => c.active && !c.routines.includes(id) && (c.creature.role === 'healer') === heals).sort((a, b) => a.routines.length - b.routines.length)[0];
    if (!m) return;
    if (m.routines.length >= m.slots) { if (gold < 50 || m.slots >= SLOTS_MAX) return; gold -= 50; m.slots++; }
    m.routines = [id, ...m.routines].sort((a, b) => Number(ROUTINES[a].condition === 'always') - Number(ROUTINES[b].condition === 'always'));
  };
  for (const [actIndex, act] of run.acts.entries()) {
    const creature = (id: string) => act.creatures.find(c => c.id === id)!;
    let legal = act.nodes.filter(n => n.floor === 0);
    while (legal.length) {
      const score = (n: MapNode) => !strong ? random() : random() + (n.kind === 'rest' ? (health() < .6 ? 3 : 0) : n.kind === 'elite' ? (health() > .9 ? 1 : -2) : n.kind === 'shop' ? (gold >= 60 ? 1.5 : 0) : n.kind === 'treasure' ? 1 : 0);
      const n = [...legal].sort((a, b) => score(b) - score(a))[0];
      floor = actIndex * 16 + n.floor;
      if (n.encounter?.length) {
        const up = crew.filter(c => c.active);
        const fight = () => simulate(createCombat(up.map(c => ({ creature: { ...c.creature, routines: [...c.routines] }, hp: c.hp })), n.encounter!.map(creature), run.seed), 3000);
        const value = (f: ReturnType<typeof fight>) => (f.result === 'win' ? 10 : 0) + f.fighters.filter(x => x.side === 'crew' && !x.summonedBy).reduce((t, x) => t + x.hp / x.maxHp, 0);
        // Enemy routines are readable, so a strong player sets up for the fight: try each routine first, keep what helps.
        if (strong) for (const c of up) for (const id of [...c.routines]) {
          const before = c.routines, best = value(fight());
          c.routines = [id, ...before.filter(x => x !== id)];
          if (value(fight()) <= best) c.routines = before;
        }
        const end = fight();
        ticks += end.t;
        if (end.result !== 'win') return { won: false, floor, lostTo: n.encounter.join('+'), ticks };
        const fighters = end.fighters.filter(f => f.side === 'crew' && !f.summonedBy);
        up.forEach((c, i) => { c.hp = fighters[i]?.hp ?? 0; });
        gold = Math.max(0, gold - end.goldStolen) + (n.kind === 'boss' ? 100 : n.kind === 'elite' ? 60 : 30);
        if (n.kind === 'elite' && act.shop.length) learn(act.shop[(n.floor + run.seed) % act.shop.length]);
      }
      if (n.kind === 'rest') {
        const upgrade = strong && health() > .8 ? crew.flatMap(c => c.routines.map((r, j) => ({ c, j, up: ROUTINES[r]?.upgradesTo }))).find(x => x.up) : undefined;
        if (upgrade) upgrade.c.routines[upgrade.j] = upgrade.up!;
        else crew.forEach(c => { c.hp = Math.min(c.max, c.hp + Math.round(c.max * .3)); });
      }
      if (n.kind === 'treasure') gold += 40;
      if (n.kind === 'shop' && strong) for (const id of act.shop) if (ROUTINES[id].price && ROUTINES[id].price <= gold && !crew.some(c => c.routines.includes(id))) { gold -= ROUTINES[id].price; learn(id); }
      if (n.kind === 'event') {
        const e = act.events.find(e => e.id === n.eventId)!;
        const o = strong ? ([...e.options].sort((a, b) => Number(b.effect.type === (health() < .6 ? 'heal' : 'routine')) - Number(a.effect.type === (health() < .6 ? 'heal' : 'routine')))[0]) : e.options[Math.floor(random() * e.options.length)];
        const fx = o.effect;
        if (fx.type === 'gold') gold = Math.max(0, gold + fx.amount);
        if (fx.type === 'routine') learn(fx.id);
        if (fx.type === 'heal' || fx.type === 'damage') crew.forEach(c => { c.hp = Math.max(0, Math.min(c.max, c.hp + Math.round(c.max * fx.amount * (fx.type === 'heal' ? 1 : -1)))); });
      }
      if (n.reward) crew.push(member(creature(n.reward), crew.filter(c => c.active).length < CREW_MAX));
      legal = act.nodes.filter(x => n.next.includes(x.id));
    }
  }
  return { won: true, floor, ticks };
}

if (process.argv[2]) {
  const run = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Run, count = Number(process.argv[3] ?? 300);
  let state = run.seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  for (const strong of [false, true]) {
    const results = Array.from({ length: count }, () => play(run, random, strong));
    const wins = results.filter(r => r.won).length, killers: Record<string, number> = {};
    for (const r of results) if (r.lostTo) killers[r.lostTo] = (killers[r.lostTo] ?? 0) + 1;
    const top = Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
    const floors = results.reduce((n, r) => n + r.floor, 0) / count, secs = results.reduce((n, r) => n + r.ticks, 0) / count / 20;
    console.log(`${strong ? 'strong' : 'novice'}: ${(100 * wins / count).toFixed(1)}% wins, avg floor ${floors.toFixed(1)}, ${secs.toFixed(0)}s of fights at 20 ticks/s; top killers: ${top}`);
  }
}
