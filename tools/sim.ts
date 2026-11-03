// Plays a built run with bots, using the game's own combat code.
// A winning bot game is a proof the run can be cleared: replaying its policy and seed gives the same win.
import { createCombat, fighter, simulate } from '../src/combat';
import { CREW_MAX, ROUTINES, SLOTS_MAX, SLOTS_START, TICK_MS } from '../src/library';
import type { Creature, GameEvent, MapNode, Run } from '../src/types';

export interface Policy {
  name: string;
  route: 'smart' | 'random'; // how it picks rooms and event options
  build: 'search' | 'heuristic' | 'none'; // search tries loadouts against the coming fight; none never edits routines
  noise: number; // chance any one decision is made at random
  start?: number; // force this column on the first floor
}
export const NOVICE: Policy = { name: 'novice', route: 'random', build: 'none', noise: 0 };
export const TYPICAL: Policy = { name: 'typical', route: 'smart', build: 'heuristic', noise: 0.2 };
export const EXPERT: Policy = { name: 'expert', route: 'smart', build: 'search', noise: 0 };
export const NO_ROUTE: Policy = { ...TYPICAL, name: 'typical, random route', route: 'random' };
export const NO_BUILD: Policy = { ...TYPICAL, name: 'typical, no routine edits', build: 'none' };

interface Member { creature: Creature; hp: number; max: number; routines: string[]; slots: number; active: boolean }
export interface RunResult { won: boolean; floor: number; lostTo?: string; ticks: number; fights: number; route: string[] }

export const rng = (seed: number) => { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) | 0; let n = Math.imul(state ^ (state >>> 15), 1 | state); n ^= n + Math.imul(n ^ (n >>> 7), 61 | n); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; }; };
const conditional = (id: string) => ROUTINES[id]?.condition !== 'always';
const WANT_HEAL = ['patch+', 'patch', 'triage', 'cover'], WANT_HIT = ['strike+', 'finish', 'breach', 'sweep+', 'sweep', 'charge', 'jam', 'corrupt', 'brace', 'last_stand', 'purge'];

export function play(run: Run, random: () => number, policy: Policy): RunResult {
  const member = (c: Creature, active: boolean): Member => { const max = fighter(c, 'crew', 'x').maxHp; return { creature: c, hp: max, max, routines: c.routines.slice(0, SLOTS_START), slots: SLOTS_START, active }; };
  const crew = run.crew.map(c => member(c, true)), pool: string[] = [], route: string[] = [];
  let gold = 0, ticks = 0, fights = 0, floor = 0;
  const editing = policy.build !== 'none';
  const smart = () => policy.route === 'smart' && random() >= policy.noise;
  const active = () => crew.filter(c => c.active);
  const health = () => { const up = active(); return up.reduce((n, c) => n + c.hp / c.max, 0) / up.length; };
  const fightWith = (n: MapNode, creature: (id: string) => Creature) => simulate(createCombat(active().map(c => ({ creature: { ...c.creature, routines: [...c.routines] }, hp: c.hp })), n.encounter!.map(creature), run.seed), 3000);
  const value = (f: ReturnType<typeof simulate>) => (f.result === 'win' ? 10 : 0) + f.fighters.filter(x => x.side === 'crew' && !x.summonedBy).reduce((t, x) => t + x.hp / x.maxHp, 0);
  // Bring reserves in for the fallen, the same as the crew screen allows.
  const swapReserves = () => { for (const dead of active().filter(c => c.hp <= 0)) { const sub = crew.find(c => !c.active && c.hp > 0); if (sub) { dead.active = false; sub.active = true; } } };
  // Equip what's in the pool with no knowledge of the coming fight.
  const equip = () => {
    for (const id of [...pool]) {
      if (!(policy.noise === 0 || random() >= policy.noise)) continue;
      const heals = WANT_HEAL.includes(id);
      if (!heals && !WANT_HIT.includes(id)) continue;
      const m = active().filter(c => !c.routines.includes(id) && (c.creature.role === 'healer') === heals).sort((a, b) => a.routines.length - b.routines.length)[0];
      if (!m) continue;
      if (m.routines.length >= m.slots) { if (gold < 50 || m.slots >= SLOTS_MAX) continue; gold -= 50; m.slots++; }
      m.routines.unshift(id); pool.splice(pool.indexOf(id), 1);
    }
    for (const c of active()) c.routines.sort((a, b) => Number(conditional(b)) - Number(conditional(a)));
  };
  // Enemy routines are public, so a careful player sets up for the fight: try each option, keep what helps.
  const search = (n: MapNode, creature: (id: string) => Creature) => {
    for (const c of active()) {
      for (const id of [...c.routines]) {
        const before = c.routines, best = value(fightWith(n, creature));
        c.routines = [id, ...before.filter(x => x !== id)];
        if (value(fightWith(n, creature)) <= best) c.routines = before;
      }
      for (const id of [...new Set(pool)]) {
        const before = c.routines, best = value(fightWith(n, creature));
        c.routines = c.routines.length < c.slots ? [id, ...before] : [id, ...before.slice(0, -1)];
        if (value(fightWith(n, creature)) > best) { pool.splice(pool.indexOf(id), 1); if (before.length >= c.slots) pool.push(before[before.length - 1]); }
        else c.routines = before;
      }
    }
  };
  for (const [actIndex, act] of run.acts.entries()) {
    const creature = (id: string) => act.creatures.find(c => c.id === id)!;
    let legal = act.nodes.filter(n => n.floor === 0);
    if (policy.start !== undefined && actIndex === 0) legal = legal.filter(n => n.x === policy.start);
    while (legal.length) {
      const score = (n: MapNode) => { if (n.hidden) return random() + .4; return random() + (n.kind === 'rest' ? (health() < .6 ? 3 : 0) : n.kind === 'elite' ? (health() > .8 ? 1.5 : -2) : n.kind === 'shop' ? (gold >= 60 ? 1.5 : 0) : n.kind === 'treasure' ? 1 : n.kind === 'event' ? .5 : 0); };
      const useScore = smart();
      const n = useScore ? [...legal].sort((a, b) => score(b) - score(a))[0] : legal[Math.floor(random() * legal.length)];
      floor = actIndex * 16 + n.floor; route.push(n.id);
      if (n.encounter?.length) {
        if (editing) { swapReserves(); equip(); if (policy.build === 'search') search(n, creature); }
        const end = fightWith(n, creature);
        ticks += end.t; fights++;
        if (end.result !== 'win') return { won: false, floor, lostTo: n.encounter.join('+'), ticks, fights, route };
        const fighters = end.fighters.filter(f => f.side === 'crew' && !f.summonedBy);
        active().forEach((c, i) => { c.hp = fighters[i]?.hp ?? 0; });
        gold = Math.max(0, gold - end.goldStolen) + (n.kind === 'boss' ? 100 : n.kind === 'elite' ? 60 : 30);
        if (n.kind === 'elite' && act.shop.length) pool.push(act.shop[(n.floor + run.seed) % act.shop.length]);
      }
      if (n.kind === 'rest') {
        const upgrade = editing && health() > .75 ? crew.flatMap(c => c.routines.map((r, j) => ({ c, j, up: ROUTINES[r]?.upgradesTo }))).find(x => x.up) : undefined;
        if (upgrade) upgrade.c.routines[upgrade.j] = upgrade.up!;
        else crew.forEach(c => { c.hp = Math.min(c.max, c.hp + Math.round(c.max * .3)); });
      }
      if (n.kind === 'treasure') { const id = act.shop[0]; if (editing && id && !crew.some(c => c.routines.includes(id)) && !pool.includes(id)) pool.push(id); else gold += 40; }
      if (n.kind === 'shop' && editing) for (const id of act.shop) if (ROUTINES[id].price && ROUTINES[id].price <= gold && !pool.includes(id) && !crew.some(c => c.routines.includes(id)) && (WANT_HEAL.includes(id) || WANT_HIT.includes(id))) { gold -= ROUTINES[id].price; pool.push(id); }
      if (n.kind === 'event') {
        const e = act.events.find(e => e.id === n.eventId) as GameEvent;
        const worth = (fx: GameEvent['options'][number]['effect']) => fx.type === 'heal' ? fx.amount * (1 - health()) * 4 : fx.type === 'damage' ? -fx.amount * 3 / Math.max(.2, health()) : fx.type === 'gold' ? fx.amount / 60 : fx.type === 'routine' ? (editing ? 1 : 0) : 0;
        const o = smart() ? [...e.options].sort((a, b) => worth(b.effect) - worth(a.effect))[0] : e.options[Math.floor(random() * e.options.length)];
        const fx = o.effect;
        if (fx.type === 'gold') gold = Math.max(0, gold + fx.amount);
        if (fx.type === 'routine') pool.push(fx.id);
        if (fx.type === 'heal' || fx.type === 'damage') crew.forEach(c => { c.hp = Math.max(0, Math.min(c.max, c.hp + Math.round(c.max * fx.amount * (fx.type === 'heal' ? 1 : -1)))); });
      }
      if (n.reward) crew.push(member(creature(n.reward), active().length < CREW_MAX));
      legal = act.nodes.filter(x => n.next.includes(x.id));
    }
  }
  return { won: true, floor, ticks, fights, route };
}

export interface Rate { policy: string; winRate: number; avgFloor: number; fightSeconds: number; killers: Record<string, number> }
export function measure(run: Run, policy: Policy, count: number, seed = run.seed): Rate {
  const random = rng(seed), results = Array.from({ length: count }, () => play(run, random, policy));
  const killers: Record<string, number> = {};
  for (const r of results) if (r.lostTo) killers[r.lostTo] = (killers[r.lostTo] ?? 0) + 1;
  const fights = results.reduce((n, r) => n + r.fights, 0) || 1;
  return { policy: policy.name, winRate: results.filter(r => r.won).length / count, avgFloor: results.reduce((n, r) => n + r.floor, 0) / count, fightSeconds: results.reduce((n, r) => n + r.ticks, 0) * TICK_MS / 1000 / fights, killers };
}
