// What each factory agent must hand over. An agent's file only moves on when these checks return nothing.
// Usage: npx vite-node tools/checks.ts <picks|ideas|content|assembly|crawl> <file> <context>, or tools/checks.ts library
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ROLE_STATS, ROUTINES, TIER_SCALE } from '../src/library';
import type { ActStory, Creature, EventEffect, SiteGraph } from '../src/types';

export interface Candidate { name: string; url: string; why: string }
export interface Picks { thread: string; candidates: Candidate[] }
export interface Idea { idea: string; source: string; why: string }
export interface Ideas { host: string; reading: string; enemies: Idea[]; allies: Idea[]; bosses: Idea[]; events: Idea[] }
export type DraftCreature = Omit<Creature, 'sprite' | 'scale' | 'puppet'> & { look: string; key?: 'magenta' | 'green' };
export interface DraftEvent { id: string; source: string; look: string; title: string; text: string; options: { label: string; effect: EventEffect; result: string }[] }
export interface DraftAct { name: string; url: string; theme: string; story: ActStory; creatures: DraftCreature[]; events: DraftEvent[] }
export interface Content { id: string; title: string; seed: number; swarm: { name: string; blurb: string }; arc: string; acts: DraftAct[] }
export interface Assembly { acts: { packs: { early: string[][]; mid: string[][]; late: string[][] }; elites: { id: string; reward: string }[]; shop: string[] }[] }

export const usedHosts = (runsDir = 'runs'): string[] => readdirSync(runsDir).filter(d => existsSync(`${runsDir}/${d}/sites.json`)).flatMap(d => (JSON.parse(readFileSync(`${runsDir}/${d}/sites.json`, 'utf8')) as { sites: { host: string }[] }).sites.map(s => s.host));
// Kinds of site the game shouldn't make fun of or point players at, whatever the agent argues.
const BANNED_HOST = /(^|\.)(facebook|instagram|tiktok|x|twitter|reddit|youtube|linkedin|pinterest|wikipedia|amazon)\.|porn|casino|gambl|bet\d|\.xxx$/i;
const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
// Generated text reaches the page as text, but markup, links, or instructions copied from a site mean the agent lost the plot.
const dirty = (s: string) => /<[a-z/!]|https?:\/\/|www\.|ignore (all |any )?(previous|prior)|system prompt/i.test(s);
const words = (label: string, s: unknown, max: number, out: string[]) => { if (!text(s, max)) out.push(`${label} must be text of at most ${max} characters`); else if (dirty(s)) out.push(`${label} contains a link, markup, or instructions`); };
const onlyKeys = (label: string, o: object, keys: string[], out: string[]) => { for (const k of Object.keys(o)) if (!keys.includes(k)) out.push(`${label} has a field that isn't allowed: ${k}`); };

export function checkPicks(p: Picks, acts: number, used: string[]): string[] {
  const out: string[] = [];
  words('thread', p?.thread, 400, out);
  if (!Array.isArray(p?.candidates) || p.candidates.length < acts + 2) return [...out, `List at least ${acts + 2} candidates`];
  for (const c of p.candidates) {
    words(`Name of ${c.url}`, c.name, 80, out); words(`Reason for ${c.url}`, c.why, 300, out);
    try { const u = new URL(c.url); if (u.protocol !== 'https:') out.push(`${c.url} must use https`); if (used.includes(u.host)) out.push(`${u.host} was already used in an earlier run`); if (BANNED_HOST.test(u.host)) out.push(`${u.host} is on the banned list`); }
    catch { out.push(`Not a URL: ${c.url}`); }
  }
  return out;
}
export function screenCrawl(g: SiteGraph): string[] {
  const out: string[] = [], sections = new Set(g.pages.map(p => p.section));
  if (g.pages.length < 25) out.push(`${g.host} gave only ${g.pages.length} pages; 25 are required`);
  if (sections.size < 4) out.push(`${g.host} has only ${sections.size} sections; 4 are required`);
  return out;
}
export function checkIdeas(x: Ideas, g: SiteGraph): string[] {
  const out: string[] = [], paths = new Set(g.pages.map(p => p.path));
  words('reading', x?.reading, 1200, out);
  for (const [list, min] of [['enemies', 14], ['allies', 3], ['bosses', 2], ['events', 10]] as const) {
    if (!Array.isArray(x?.[list]) || x[list].length < min) { out.push(`${list} needs at least ${min} ideas`); continue; }
    for (const i of x[list]) { words(`${list} idea`, i.idea, 400, out); words(`${list} reason`, i.why, 300, out); if (!paths.has(i.source)) out.push(`${list} idea cites a page that wasn't crawled: ${i.source}`); }
  }
  if (Array.isArray(x?.enemies) && new Set(x.enemies.map(e => e.source)).size < 8) out.push('Enemy ideas must draw on at least 8 different pages');
  return out;
}
const QUOTA: Record<string, [number, number]> = { easy: [3, 4], regular: [5, 7], elite: [3, 4], boss: [1, 1], ally: [2, 3] };
export function checkContent(c: Content, graphs: SiteGraph[]): string[] {
  const out: string[] = [], ids = new Set<string>();
  const uniqueId = (id: unknown) => { if (typeof id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(id)) out.push(`Bad id: ${String(id)}`); else if (ids.has(id)) out.push(`Id used twice: ${id}`); else ids.add(id); };
  words('title', c?.title, 80, out); words('swarm name', c?.swarm?.name, 40, out); words('swarm blurb', c?.swarm?.blurb, 300, out); words('arc', c?.arc, 800, out);
  if (!Array.isArray(c?.acts) || c.acts.length !== graphs.length) return [...out, `Write exactly ${graphs.length} acts, one per site, in order`];
  c.acts.forEach((a, i) => {
    const act = `Act ${i + 1}`, paths = new Set(graphs[i].pages.map(p => p.path));
    onlyKeys(act, a, ['name', 'url', 'theme', 'story', 'creatures', 'events'], out);
    words(`${act} theme`, a.theme, 120, out);
    words(`${act} intro`, a.story?.intro, 500, out); words(`${act} boss intro`, a.story?.bossIntro, 400, out); words(`${act} outro`, a.story?.outro, 500, out);
    if (a.story?.chapters?.length !== 3) out.push(`${act} needs 3 chapters`); else a.story.chapters.forEach((h, j) => { words(`${act} chapter ${j + 1} title`, h.title, 60, out); words(`${act} chapter ${j + 1} text`, h.text, 400, out); });
    for (const [tier, [low, high]] of Object.entries(QUOTA)) { const n = a.creatures?.filter(x => x.tier === tier).length ?? 0; if (n < low || n > high) out.push(`${act} needs ${low}-${high} ${tier} creatures, found ${n}`); }
    for (const x of a.creatures ?? []) {
      const who = x.id; uniqueId(x.id);
      onlyKeys(who, x, ['id', 'name', 'tier', 'bodyPlan', 'role', 'routines', 'source', 'blurb', 'look', 'key'], out);
      words(`${who} name`, x.name, 40, out); words(`${who} blurb`, x.blurb, 220, out); words(`${who} look`, x.look, 400, out);
      if (!paths.has(x.source)) out.push(`${who} cites a page that wasn't crawled: ${x.source}`);
      if (!Object.hasOwn(ROLE_STATS, x.role)) out.push(`${who} has an unknown role: ${x.role}`);
      if (!Object.hasOwn(TIER_SCALE, x.tier)) out.push(`${who} has an unknown tier: ${x.tier}`);
      if (!['humanoid','beast','flier','swarm','blob','serpent','object','construct','plant','colossus'].includes(x.bodyPlan)) out.push(`${who} has an unknown body plan: ${x.bodyPlan}`);
      if (!Array.isArray(x.routines) || !x.routines.length || x.routines.length > 3) out.push(`${who} needs 1-3 routines`);
      else for (const r of x.routines) { if (!Object.hasOwn(ROUTINES, r)) out.push(`${who} uses an unknown routine: ${r}`); else if (x.tier === 'ally' && !ROUTINES[r].price) out.push(`${who} is an ally and can't use the swarm-only routine ${r}`); }
    }
    for (const x of a.creatures ?? []) if (x.tier === 'boss' && !x.routines?.some(r => ['strike', 'heavy', 'sweep', 'overflow', 'charge'].includes(ROUTINES[r]?.action))) out.push(`${x.id} is a boss and needs a routine that deals damage, or the fight is a stall the player can only lose on time`);
    if (new Set(a.creatures?.map(x => x.source)).size < 7) out.push(`${act} creatures must cite at least 7 different pages`);
    if (!Array.isArray(a.events) || a.events.length < 6 || a.events.length > 9) out.push(`${act} needs 6-9 events`);
    for (const e of a.events ?? []) {
      const who = e.id; uniqueId(e.id);
      onlyKeys(who, e, ['id', 'source', 'look', 'title', 'text', 'options'], out);
      words(`${who} title`, e.title, 60, out); words(`${who} text`, e.text, 500, out); words(`${who} look`, e.look, 400, out);
      if (!paths.has(e.source)) out.push(`${who} cites a page that wasn't crawled: ${e.source}`);
      if (!Array.isArray(e.options) || e.options.length < 2 || e.options.length > 3) { out.push(`${who} needs 2-3 options`); continue; }
      const types = e.options.map(o => o.effect?.type);
      if (new Set(types).size < 2) out.push(`${who} needs options with different effects, so the choice means something`);
      if (e.options.every(o => o.effect?.type === 'gold' && o.effect.amount < 0)) out.push(`${who} needs an option a player with no gold can take`);
      if (types.includes('nothing') && types.every(t => t === 'nothing' || t === 'heal' || t === 'gold' || t === 'routine')) out.push(`${who} offers a free reward next to doing nothing, which isn't a choice`);
      for (const o of e.options) {
        words(`${who} option label`, o.label, 70, out); words(`${who} option result`, o.result, 220, out);
        const fx = o.effect;
        if (fx?.type === 'heal' && !(fx.amount > 0 && fx.amount <= 0.4)) out.push(`${who}: heal must be above 0 and at most 0.4`);
        else if (fx?.type === 'damage' && !(fx.amount > 0 && fx.amount <= 0.3)) out.push(`${who}: damage must be above 0 and at most 0.3`);
        else if (fx?.type === 'gold' && !(Math.abs(fx.amount) > 0 && Math.abs(fx.amount) <= 100)) out.push(`${who}: gold must be at most 100 either way`);
        else if (fx?.type === 'routine' && !ROUTINES[fx.id]?.price) out.push(`${who}: can only give routines sold in shops, not ${fx.id}`);
        else if (!['heal', 'damage', 'gold', 'routine', 'nothing'].includes(fx?.type)) out.push(`${who}: unknown effect`);
      }
    }
  });
  return out;
}
export function checkAssembly(p: Assembly, c: Content): string[] {
  const out: string[] = [];
  if (!Array.isArray(p?.acts) || p.acts.length !== c.acts.length) return [`Plan exactly ${c.acts.length} acts`];
  p.acts.forEach((a, i) => {
    const act = `Act ${i + 1}`, tier = new Map(c.acts[i].creatures.map(x => [x.id, x.tier]));
    const allowed = { early: ['easy'], mid: ['easy', 'regular'], late: ['easy', 'regular'] } as const, seen = new Set<string>();
    for (const band of ['early', 'mid', 'late'] as const) {
      const packs = a.packs?.[band];
      if (!Array.isArray(packs) || packs.length < 3 || packs.length > 8) { out.push(`${act} ${band} needs 3-8 packs`); continue; }
      for (const pack of packs) {
        if (!Array.isArray(pack) || !pack.length || pack.length > (band === 'early' ? 2 : 3)) { out.push(`${act} ${band} pack has the wrong size: ${String(pack)}`); continue; }
        for (const id of pack) { seen.add(id); if (!allowed[band].includes(tier.get(id) as 'easy')) out.push(`${act} ${band} can't use ${id} (${tier.get(id) ?? 'unknown'})`); }
      }
    }
    if (!Array.isArray(a.elites) || a.elites.length < 2) out.push(`${act} needs at least 2 elites`);
    for (const e of a.elites ?? []) { if (tier.get(e.id) !== 'elite') out.push(`${act}: ${e.id} isn't an elite`); if (tier.get(e.reward) !== 'ally') out.push(`${act}: reward ${e.reward} isn't an ally`); seen.add(e.id); seen.add(e.reward); }
    for (const [id, t] of tier) if (t !== 'boss' && !seen.has(id)) out.push(`${act}: ${id} was written and drawn but never appears`);
    if (!Array.isArray(a.shop) || a.shop.length < 5 || a.shop.length > 12) out.push(`${act} shop needs 5-12 routines`);
    else for (const id of a.shop) if (!ROUTINES[id]?.price) out.push(`${act} shop can't sell ${id}`);
  });
  return out;
}

if (process.argv[1]?.endsWith('vite-node') && process.argv[2] === 'library') console.log(JSON.stringify({ roles: ROLE_STATS, tiers: TIER_SCALE, routines: ROUTINES }, null, 1));
if (process.argv[1]?.endsWith('vite-node') && process.argv[2]?.match(/^(picks|ideas|content|assembly|crawl)$/)) {
  const [stage, file, ...rest] = process.argv.slice(2), read = <T,>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
  let problems: string[];
  try {
    const value = read<never>(file);
    if (stage === 'crawl') problems = screenCrawl(value);
    else if (stage === 'picks') problems = checkPicks(value, Number(rest[0]), usedHosts());
    else if (stage === 'ideas') problems = checkIdeas(value, read<SiteGraph>(rest[0]));
    else if (stage === 'content') problems = checkContent(value, read<{ sites: { file: string }[] }>(rest[0]).sites.map(s => read<SiteGraph>(s.file)));
    else problems = checkAssembly(value, read<Content>(rest[0]));
  } catch (error) { problems = [`Can't read ${file}: ${String(error)}`]; }
  if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('ok');
}
