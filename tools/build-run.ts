// Turns hand-curated content plus a site crawl into public/runs/<id>/run.json and the manifest.
// Usage: npx vite-node tools/build-run.ts runs/<id>/content.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildActMap, checkActMap } from '../src/act';
import { checkRun } from '../src/run';
import type { Creature, GameEvent, MapNode, Run, SiteGraph } from '../src/types';

const content = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const graph = JSON.parse(readFileSync(content.site, 'utf8')) as SiteGraph;
const creature = (c: Creature & { look?: string; key?: string; ally?: boolean }, dir: string): Creature => {
  const { look: _look, key: _key, ally: _ally, ...rest } = c;
  return { ...rest, sprite: `/art/${dir}/${c.id}.webp` };
};
const crew: Creature[] = content.crew.map((c: Creature) => creature({ ...c, tier: 'ally' }, 'crew'));
const creatures: Creature[] = content.creatures.map((c: Creature) => creature(c, content.id));
const events: (GameEvent & { source?: string })[] = content.events;

const nodes: MapNode[] = buildActMap(graph, content.seed);
const problems = checkActMap(nodes);
if (problems.length) throw new Error(problems.join('\n'));

const tier = (t: string) => creatures.filter(c => c.tier === t).map(c => c.id);
const pick = (list: string[], i: number) => list[i % list.length];
const allies = tier('ally');
let fights = 0, elites = 0, evs = 0;
for (const n of [...nodes].sort((a, b) => a.floor - b.floor || a.x - b.x)) {
  n.label = n.label.replace(/\s*\|\s*NIST$/, '');
  if (n.kind === 'fight') {
    const i = fights++;
    if (n.easy) n.encounter = [pick(tier('easy'), i)];
    else if (n.floor < 8) n.encounter = i % 2 ? [pick(tier('regular'), i)] : [pick(tier('easy'), i), pick(tier('regular'), i)];
    else n.encounter = [pick(tier('regular'), i), pick(tier('regular'), i + 1)];
  }
  if (n.kind === 'elite') { n.encounter = [pick(tier('elite'), elites)]; n.reward = pick(allies, elites); elites++; }
  if (n.kind === 'boss') n.encounter = tier('boss');
  if (n.kind === 'event') n.eventId = events[evs++ % events.length].id;
}

const run: Run = {
  id: content.id, title: content.title, swarm: content.swarm, crew, seed: content.seed,
  acts: [{ site: { name: content.act.name, url: content.act.url, note: content.act.note }, theme: content.act.theme, nodes, creatures, events, shop: content.act.shop }],
};
const errors = checkRun(run);
if (errors.length) throw new Error(errors.join('\n'));
mkdirSync(`public/runs/${run.id}`, { recursive: true });
writeFileSync(`public/runs/${run.id}/run.json`, JSON.stringify(run));
const opens = `${run.id}T13:00:00Z`;
writeFileSync('public/manifest.json', JSON.stringify({ runId: run.id, opensAt: opens, nextOpensAt: new Date(Date.parse(opens) + 86400000).toISOString().replace('.000', ''), runUrl: `/runs/${run.id}/run.json`, voided: [] }, null, 2) + '\n');
console.log(`Built ${run.id}: ${nodes.length} rooms, ${creatures.length} creatures, ${events.length} events`);
