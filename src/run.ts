import { ENEMY_SCALE, ROUTINES } from './library';
import { isCreature } from './save';
import type { Run } from './types';

export function checkRun(value: unknown): string[] {
  try { return validateRun(value); } catch { return ['Run contains malformed data']; }
}
function validateRun(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['Run must be an object'];
  const run = value as Run;
  if (typeof run.id !== 'string' || typeof run.title !== 'string' || !run.swarm || typeof run.swarm.name !== 'string' || typeof run.swarm.blurb !== 'string' || typeof run.seed !== 'number' || !Number.isFinite(run.seed)) errors.push('Run metadata is missing or invalid');
  if (!Array.isArray(run.crew) || !Array.isArray(run.acts) || !run.acts.length) return [...errors, 'Run needs crew and acts'];
  if (!run.crew.length) errors.push('Run needs a starting crew');
  for (const c of run.crew) { if (!isCreature(c)) errors.push(`Invalid starting creature: ${(c as {id?: string} | null)?.id ?? '?'}`); for (const id of c?.routines ?? []) if (!Object.hasOwn(ROUTINES, id)) errors.push(`Unknown routine: ${id}`); }
  for (const [i, act] of run.acts.entries()) {
    if (!act || !act.site || typeof act.site.name !== 'string' || typeof act.site.url !== 'string' || typeof act.site.note !== 'string' || typeof act.theme !== 'string' || !Array.isArray(act.nodes) || !Array.isArray(act.creatures) || !Array.isArray(act.events) || !Array.isArray(act.shop)) { errors.push(`Invalid act ${i + 1}`); continue; }
    const creatures = new Set(act.creatures.map(c => c.id)); const nodes = new Map(act.nodes.map(n => [n.id, n])); const events = new Set(act.events.map(e => e.id));
    if (nodes.size !== act.nodes.length) errors.push(`Duplicate node in act ${i + 1}`);
    for (const c of act.creatures) if (c?.scale !== undefined && !(c.scale >= ENEMY_SCALE.min && c.scale <= ENEMY_SCALE.max)) errors.push(`Enemy scale out of range: ${c.id}`);
    for (const c of act.creatures) { if (!isCreature(c)) errors.push(`Invalid creature: ${(c as {id?: string} | null)?.id ?? '?'}`); for (const id of c?.routines ?? []) if (!Object.hasOwn(ROUTINES, id)) errors.push(`Unknown routine: ${id}`); }
    for (const id of act.shop) if (!Object.hasOwn(ROUTINES, id)) errors.push(`Unknown routine: ${id}`);
    for (const e of act.events) { if (!e || typeof e.title !== 'string' || typeof e.text !== 'string' || !Array.isArray(e.options) || !e.options.length) { errors.push('Invalid event'); continue; } for (const o of e.options) { if (!o.effect || !['heal','damage','gold','routine','nothing'].includes(o.effect.type) || typeof o.label !== 'string' || typeof o.result !== 'string') errors.push(`Invalid event option: ${e.id}`); else if (o.effect.type === 'routine' && !Object.hasOwn(ROUTINES, o.effect.id)) errors.push(`Unknown routine: ${o.effect.id}`); else if (['heal','damage','gold'].includes(o.effect.type) && (!('amount' in o.effect) || typeof o.effect.amount !== 'number' || !Number.isFinite(o.effect.amount) || o.effect.amount < 0)) errors.push(`Invalid event effect: ${e.id}`); } }
    for (const n of act.nodes) {
      if (!n || typeof n.id !== 'string' || !Number.isInteger(n.floor) || typeof n.x !== 'number' || typeof n.label !== 'string' || typeof n.sourcePath !== 'string' || typeof n.easy !== 'boolean' || !Array.isArray(n.next) || !['fight','elite','rest','event','shop','treasure','boss'].includes(n.kind)) { errors.push('Invalid node'); continue; }
      for (const id of n.next) if (!nodes.has(id) || nodes.get(id)!.floor !== n.floor + 1) errors.push(`Bad node reference: ${n.id} → ${id}`);
      for (const id of n.encounter ?? []) if (!creatures.has(id)) errors.push(`Missing creature: ${id}`);
      if (n.reward && !creatures.has(n.reward)) errors.push(`Missing creature: ${n.reward}`);
      if (['fight','elite','boss'].includes(n.kind) && (!Array.isArray(n.encounter) || !n.encounter.length)) errors.push(`Missing encounter: ${n.id}`);
      if (n.kind === 'event' && (!n.eventId || !events.has(n.eventId))) errors.push(`Missing event: ${n.id}`);
    }
    if (!act.nodes.some(n => n.floor === 0) || !act.nodes.some(n => n.kind === 'boss')) errors.push(`Act ${i + 1} needs a first floor and boss`);
    for (const n of act.nodes) if (n && n.kind !== 'boss' && !n.next?.length) errors.push(`Dead end: ${n.id}`);
  }
  return errors;
}
