import { OVERRIDE_COOLDOWN_TICKS, ROLE_STATS, ROUTINES, TIER_SCALE } from './library';
import type { ActionId, Routine } from './library';
import type { Creature } from './types';

export interface Fighter {
  id: string; creature: Creature; side: 'crew' | 'enemy'; hp: number; maxHp: number; power: number; speed: number; shield: number;
  corrupted: number; stunned: boolean; routines: string[]; nextAction: number; summons: number; splitDone: boolean;
  lastAction?: ActionId; charging: boolean; summonedBy?: string;
}
export interface CombatEvent { t: number; kind: string; actor: string; target: string; amount: number; routine: string }
export interface CombatState { t: number; seed: number; fighters: Fighter[]; events: CombatEvent[]; result: 'win' | 'loss' | null; goldStolen: number; cooldown: number; queued: { actorId: string; routineId: string } | null; serial: number }

export function fighter(creature: Creature, side: Fighter['side'], id: string, hp?: number): Fighter {
  const base = ROLE_STATS[creature.role], scale = TIER_SCALE[creature.tier];
  const maxHp = Math.round(base.hp * scale.hp);
  return { id, creature, side, hp: Math.max(0, Math.min(hp ?? maxHp, maxHp)), maxHp, power: base.power * scale.power, speed: base.speed, shield: 0, corrupted: 0, stunned: false, routines: [...creature.routines], nextAction: base.speed, summons: 0, splitDone: false, charging: false };
}
export function createCombat(crew: { creature: Creature; hp?: number }[], enemies: Creature[], seed: number): CombatState {
  return { t: 0, seed: seed >>> 0, fighters: [...crew.map((c, i) => fighter(c.creature, 'crew', `c${i}`, c.hp)), ...enemies.map((c, i) => fighter(c, 'enemy', `e${i}`))], events: [], result: null, goldStolen: 0, cooldown: 0, queued: null, serial: 0 };
}
const living = (s: CombatState, side: Fighter['side']) => s.fighters.filter(f => f.side === side && f.hp > 0);
const lowest = (fs: Fighter[]) => fs.reduce<Fighter | undefined>((a, b) => !a || b.hp < a.hp ? b : a, undefined);
export function condition(s: CombatState, f: Fighter, r: Routine): boolean {
  const allies = living(s, f.side), foes = living(s, f.side === 'crew' ? 'enemy' : 'crew'), n = r.arg ?? 0;
  switch (r.condition) {
    case 'always': return true;
    case 'self_hp_below': return f.hp / f.maxHp < n;
    case 'ally_hp_below': return allies.some(a => a.hp / a.maxHp < n);
    case 'ally_down': return s.fighters.some(a => a.side === f.side && a.hp <= 0);
    case 'self_unshielded': return f.shield <= 0;
    case 'foe_shielded': return foes.some(a => a.shield > 0);
    case 'foe_hp_below': return foes.some(a => a.hp / a.maxHp < n);
    case 'foes_at_least': return foes.length >= n;
    case 'self_corrupted': return f.corrupted > 0;
  }
}
function emit(s: CombatState, kind: string, actor: Fighter, target: Fighter, amount: number, routine: string) { s.events.push({ t: s.t, kind, actor: actor.id, target: target.id, amount, routine }); }
function damage(s: CombatState, actor: Fighter, target: Fighter, amount: number, routine: string, action: ActionId, overflow = false) {
  if (overflow) target.shield = 0;
  const absorbed = Math.min(target.shield, amount); target.shield -= absorbed;
  const dealt = Math.min(target.hp, amount - absorbed); target.hp -= dealt;
  target.lastAction = action; emit(s, 'damage', actor, target, dealt, routine);
  if (target.hp <= 0) emit(s, 'death', actor, target, 0, routine);
}
function act(s: CombatState, f: Fighter, r: Routine, action: ActionId = r.action) {
  const allies = living(s, f.side), foes = living(s, f.side === 'crew' ? 'enemy' : 'crew');
  const foe = lowest(foes), ally = lowest(allies); if (!foe || !ally) return;
  const hit = (target: Fighter, multiplier: number, overflow = false) => damage(s, f, target, Math.round(f.power * multiplier), r.id, action, overflow);
  const heal = (target: Fighter, multiplier: number) => { const amount = Math.min(target.maxHp - target.hp, Math.round(f.power * multiplier)); target.hp += amount; target.lastAction = action; emit(s, 'heal', f, target, amount, r.id); };
  const guard = (target: Fighter) => { const amount = Math.max(0, Math.min(target.maxHp * .5 - target.shield, Math.round(f.power * 1.5))); target.shield += amount; target.lastAction = action; emit(s, 'shield', f, target, amount, r.id); };
  emit(s, 'action', f, f, 0, r.id);
  switch (action) {
    case 'strike': hit(foe, 1); break;
    case 'heavy': hit(foe, 1.8); break;
    case 'sweep': foes.forEach(a => hit(a, .6)); break;
    case 'overflow': hit(foe, 1.5, true); break;
    case 'patch': heal(ally, 1.5); break;
    case 'mend_all': allies.forEach(a => heal(a, .8)); break;
    case 'guard_self': guard(f); break;
    case 'guard_ally': guard(ally); break;
    case 'corrupt': foe.corrupted = 24; foe.lastAction = action; emit(s, 'corrupt', f, foe, 24, r.id); break;
    case 'purge': f.corrupted = 0; emit(s, 'purge', f, f, 0, r.id); break;
    case 'stun': foe.stunned = true; foe.lastAction = action; emit(s, 'stun', f, foe, 0, r.id); break;
    case 'summon': case 'split': {
      if ((action === 'summon' && f.summons >= 2) || (action === 'split' && f.splitDone)) { hit(foe, 1); break; }
      if (action === 'summon') f.summons++; else f.splitDone = true;
      const copy = fighter(f.creature, f.side, `${f.id}-s${++s.serial}`); copy.maxHp = Math.max(1, Math.floor(f.maxHp / 2)); copy.hp = action === 'split' ? Math.max(1, Math.floor(f.hp / 2)) : copy.maxHp;
      copy.power = f.power / 2; copy.nextAction = s.t + copy.speed; copy.summonedBy = f.id; copy.splitDone = true; copy.summons = 2;
      s.fighters.push(copy); emit(s, action, f, copy, copy.hp, r.id); break;
    }
    case 'steal': hit(foe, 1); s.goldStolen++; emit(s, 'steal', f, foe, 1, r.id); break;
    case 'mirror': if (f.lastAction && f.lastAction !== 'mirror') act(s, f, r, f.lastAction); else hit(foe, 1); break;
    case 'charge': if (f.charging) { f.charging = false; hit(foe, 3); } else { f.charging = true; emit(s, 'charge', f, f, 0, r.id); } break;
  }
}
export function order(state: CombatState, actorId: string, routineId: string): CombatState {
  const s = structuredClone(state); const f = s.fighters.find(a => a.id === actorId && a.side === 'crew' && a.hp > 0);
  if (!s.result && s.cooldown <= 0 && !s.queued && f && f.routines.includes(routineId) && ROUTINES[routineId]) s.queued = { actorId, routineId };
  return s;
}
// The generator belongs to the fight state; no browser entropy or clock enters a simulation.
function nextRandom(s: CombatState): number {
  s.seed = (s.seed + 0x6D2B79F5) >>> 0;
  let value = s.seed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
export function step(state: CombatState): CombatState {
  const s = structuredClone(state); if (s.result) return s; s.t++; nextRandom(s); s.cooldown = Math.max(0, s.cooldown - 1);
  for (const f of [...s.fighters]) {
    if (f.hp <= 0) continue;
    if (f.corrupted > 0) { if (f.corrupted % 4 === 0) { f.hp = Math.max(0, f.hp - 1); emit(s, 'damage', f, f, 1, 'corrupt'); if (!f.hp) emit(s, 'death', f, f, 0, 'corrupt'); } f.corrupted--; if (f.hp <= 0) continue; }
    if (s.t < f.nextAction) continue; f.nextAction = s.t + f.speed;
    if (f.stunned) { f.stunned = false; emit(s, 'stunned', f, f, 0, ''); continue; }
    let r: Routine | undefined;
    if (s.queued?.actorId === f.id) { r = ROUTINES[s.queued.routineId]; s.queued = null; s.cooldown = OVERRIDE_COOLDOWN_TICKS; }
    if (f.charging) r = ROUTINES.charge;
    r ??= f.routines.map(id => ROUTINES[id]).find(routine => routine && condition(s, f, routine)) ?? ROUTINES.strike;
    act(s, f, r);
  }
  if (!living(s, 'crew').length) s.result = 'loss'; else if (!living(s, 'enemy').length) s.result = 'win'; else if (s.t >= 3000) s.result = 'loss';
  return s;
}
export function simulate(state: CombatState, ticks: number): CombatState { let s = state; for (let i = 0; i < ticks && !s.result; i++) s = step(s); return s; }
