import type { Creature, Manifest } from './types';
import type { CombatState } from './combat';
import { ROUTINES, ROLE_STATS, TIER_SCALE } from './library';

export interface CrewMember { creature: Creature; hp: number; routines: string[]; slots: number; recruited: boolean; active: boolean }
export interface CampEntry { ally: Creature; runId: string; wonAt: string; sites: string[] }
export interface Today { runId: string; node: string | null; cleared: string[]; crew: CrewMember[]; deck: string[]; gold: number; seed: number; result: 'win' | 'loss' | null; act?: number; pending?: string | null; combat?: CombatState }
export interface Save { version: 1; camp: CampEntry[]; today: Today | null; results: Record<string, 'win' | 'loss'>; restored?: string[] }
const KEY = 'swarmbreak-save-v1';
export const newSave = (): Save => ({ version: 1, camp: [], today: null, results: {} });
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string';
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(str);
export function isCreature(x: unknown): x is Creature {
  return obj(x) && str(x.id) && str(x.name) && str(x.blurb) && str(x.sprite) && str(x.source) && str(x.bodyPlan) && ['humanoid','beast','flier','swarm','blob','serpent','object','construct','plant','colossus'].includes(x.bodyPlan) && str(x.role) && Object.hasOwn(ROLE_STATS, x.role) && str(x.tier) && Object.hasOwn(TIER_SCALE, x.tier) && strings(x.routines) && x.routines.every(r => Object.hasOwn(ROUTINES, r));
}
export function parseSave(text: string): Save {
  const x: unknown = JSON.parse(text);
  if (!obj(x) || x.version !== 1 || !Array.isArray(x.camp) || !obj(x.results)) throw new Error('Invalid save format');
  if (!Object.values(x.results).every(v => v === 'win' || v === 'loss')) throw new Error('Invalid results');
  for (const c of x.camp) if (!obj(c) || !isCreature(c.ally) || !str(c.runId) || !str(c.wonAt) || !strings(c.sites)) throw new Error('Invalid camp');
  if (x.today !== null) {
    const t = x.today;
    if (!obj(t) || !str(t.runId) || !(t.node === null || str(t.node)) || !strings(t.cleared) || !Array.isArray(t.crew) || !strings(t.deck) || !t.deck.every(r => Object.hasOwn(ROUTINES, r)) || typeof t.gold !== 'number' || !Number.isFinite(t.gold) || typeof t.seed !== 'number' || !Number.isFinite(t.seed) || !(t.result === null || t.result === 'win' || t.result === 'loss') || (t.act !== undefined && (!Number.isInteger(t.act) || (t.act as number) < 0)) || (t.pending !== undefined && t.pending !== null && !str(t.pending))) throw new Error('Invalid current run');
    if (t.combat !== undefined) {
      const fight = t.combat;
      if (!obj(fight) || !Number.isInteger(fight.t) || (fight.t as number) < 0 || (fight.t as number) > 3000 || !Number.isFinite(fight.seed) || !Number.isFinite(fight.cooldown) || !Number.isFinite(fight.goldStolen) || !Number.isFinite(fight.serial) || !Array.isArray(fight.events) || !Array.isArray(fight.fighters) || !(fight.result === null || fight.result === 'win' || fight.result === 'loss') || !(fight.queued === null || (obj(fight.queued) && str(fight.queued.actorId) && str(fight.queued.routineId) && Object.hasOwn(ROUTINES, fight.queued.routineId)))) throw new Error('Invalid saved fight');
      for (const f of fight.fighters) if (!obj(f) || !str(f.id) || !isCreature(f.creature) || !['crew','enemy'].includes(String(f.side)) || !['hp','maxHp','power','speed','shield','corrupted','nextAction','summons'].every(k => typeof f[k] === 'number' && Number.isFinite(f[k])) || !strings(f.routines) || !f.routines.every(r => Object.hasOwn(ROUTINES, r)) || typeof f.stunned !== 'boolean' || typeof f.splitDone !== 'boolean' || typeof f.charging !== 'boolean') throw new Error('Invalid saved fighter');
      for (const e of fight.events) if (!obj(e) || !Number.isFinite(e.t) || !str(e.kind) || !str(e.actor) || !str(e.target) || !Number.isFinite(e.amount) || !str(e.routine)) throw new Error('Invalid fight event');
    }
    for (const c of t.crew) if (!obj(c) || !isCreature(c.creature) || typeof c.hp !== 'number' || !Number.isFinite(c.hp) || c.hp < 0 || !strings(c.routines) || !c.routines.every(r => Object.hasOwn(ROUTINES, r)) || !Number.isInteger(c.slots) || (c.slots as number) < 1 || (c.slots as number) > 8 || typeof c.recruited !== 'boolean' || typeof c.active !== 'boolean') throw new Error('Invalid crew');
  }
  return x as unknown as Save;
}
let memory = newSave();
export function loadSave(): Save { try { const raw = localStorage.getItem(KEY); if (raw) memory = parseSave(raw); } catch { /* storage can be unavailable */ } return structuredClone(memory); }
export function writeSave(save: Save): void { memory = structuredClone(save); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* session continues in memory */ } }
export function exportSave(save: Save): string { return JSON.stringify(save, null, 2); }
export function importSave(text: string): Save { const save = parseSave(text); writeSave(save); return save; }
export function rollover(save: Save, manifest: Manifest): Save {
  const s = structuredClone(save);
  // A voided run gives a losing player one more attempt, once.
  if (manifest.voided.includes(manifest.runId) && !s.restored?.includes(manifest.runId) && (s.results[manifest.runId] === 'loss' || (s.today?.runId === manifest.runId && s.today.result === 'loss'))) {
    delete s.results[manifest.runId]; if (s.today?.runId === manifest.runId) s.today = null; s.restored = [...(s.restored ?? []), manifest.runId];
  }
  if (s.today && s.today.runId !== manifest.runId) { if (!s.results[s.today.runId]) s.results[s.today.runId] = s.today.result ?? 'loss'; s.today = null; }
  return s;
}
export function finishRun(save: Save, result: 'win' | 'loss', chosen: Creature | null, wonAt: string, sites: string[]): Save {
  const s = structuredClone(save), t = s.today;
  if (!t || s.results[t.runId] || t.result) return s;
  if (result === 'win' && chosen) { const member = t.crew.find(c => c.recruited && c.creature.id === chosen.id); if (!member) throw new Error('Choose an ally recruited during this run'); s.camp.push({ ally: { ...member.creature, routines: [...member.routines] }, runId: t.runId, wonAt, sites: [...sites] }); }
  t.result = result; s.results[t.runId] = result; return s;
}
