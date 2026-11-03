// Gameplay's build step: turns a run's story and assembly plan plus its site crawls into a playable run.
// Usage: npx vite-node tools/build-run.ts runs/<id> [--open]   (--open also points public/manifest.json at it)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildActMap, checkActMap } from '../src/act';
import { checkRun } from '../src/run';
import type { Creature, GameEvent, MapNode, Run, RunAct, SiteGraph } from '../src/types';
import { rng } from './sim';
import type { Assembly, Content } from './checks';

export const CHAPTERS = 3, FLOORS_PER_CHAPTER = 5;
export const chapterOf = (floor: number) => Math.min(CHAPTERS - 1, Math.floor(floor / FLOORS_PER_CHAPTER));
// A page title without the site name most sites append to it.
export const cleanTitle = (title: string) => { const first = title.split(/\s+[|–—-]\s+/)[0].trim(); return first.length >= 4 ? first : title.trim(); };
const shuffled = <T,>(list: T[], random: () => number) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const HIDDEN_ODDS: Partial<Record<MapNode['kind'], number>> = { event: 0.6, treasure: 0.5, fight: 0.15 };

export function assemble(content: Content, plan: Assembly, crew: Creature[], graphs: SiteGraph[]): Run {
  const acts: RunAct[] = content.acts.map((a, i) => {
    const graph = graphs[i], p = plan.acts[i], random = rng(content.seed + i * 7919), nodes = buildActMap(graph, content.seed + i * 7919);
    const problems = checkActMap(nodes); if (problems.length) throw new Error(problems.join('\n'));
    const titles = new Map(graph.pages.map(page => [page.path, cleanTitle(page.title)]));
    const creatures: Creature[] = a.creatures.map(({ look: _look, key: _key, ...c }) => ({ ...c, sprite: `/art/${content.id}/${c.id}.webp`, ...(c.tier === 'boss' ? { puppet: true } : {}) }));
    const byId = new Map(creatures.map(c => [c.id, c]));
    const events: GameEvent[] = a.events.map(({ look: _look, source: _source, ...e }) => ({ ...e, art: `/art/${content.id}/${e.id}.webp` }));
    const sourceOf = new Map(a.events.map(e => [e.id, e.source]));
    // Rooms take their page from what's in them, so a fight in the Weather Archive is a Weather Archive creature.
    const place = (n: MapNode, path: string) => { n.sourcePath = path; n.label = titles.get(path) ?? n.label; };
    const bands = (['early', 'mid', 'late'] as const).map(band => ({ list: shuffled(p.packs[band], random), at: 0 }));
    const elites = shuffled(p.elites, random), eventOrder = shuffled(a.events.map(e => e.id), random);
    let eliteAt = 0, eventAt = 0;
    for (const n of [...nodes].sort((x, y) => x.floor - y.floor || x.x - y.x)) {
      if (n.kind === 'fight') { const band = bands[chapterOf(n.floor)], pack = band.list[band.at++ % band.list.length]; n.encounter = pack; place(n, byId.get(pack[0])!.source); }
      if (n.kind === 'elite') { const e = elites[eliteAt++ % elites.length]; n.encounter = [e.id]; n.reward = e.reward; place(n, byId.get(e.id)!.source); }
      if (n.kind === 'boss') { const boss = creatures.find(c => c.tier === 'boss')!; n.encounter = [boss.id]; place(n, boss.source); }
      if (n.kind === 'event') { n.eventId = eventOrder[eventAt++ % eventOrder.length]; place(n, sourceOf.get(n.eventId)!); }
      if (!n.easy && random() < (HIDDEN_ODDS[n.kind] ?? 0)) n.hidden = true;
      n.label = cleanTitle(n.label);
    }
    return {
      site: { name: a.name, url: a.url, note: `A fan-made game inspired by public pages on ${new URL(a.url).host}. Not affiliated with or endorsed by ${a.name}. All art and text are original.` },
      theme: a.theme, nodes, creatures, events, shop: p.shop, story: a.story,
      art: { map: `/art/${content.id}/map-${i}.webp`, backdrops: [0, 1, 2].map(c => `/art/${content.id}/backdrop-${i}-${c}.webp`) },
    };
  });
  const run: Run = { id: content.id, title: content.title, swarm: content.swarm, crew: crew.map(c => ({ ...c, tier: 'ally', sprite: `/art/crew/${c.id}.webp` })), seed: content.seed, acts };
  const errors = checkRun(run); if (errors.length) throw new Error(errors.join('\n'));
  return run;
}

if (process.argv[1]?.endsWith('vite-node') && process.argv[2]?.startsWith('runs/')) {
  const dir = process.argv[2], read = <T,>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
  const content = read<Content>(`${dir}/content.json`), sites = read<{ sites: { file: string }[] }>(`${dir}/sites.json`).sites;
  const crew = read<{ crew: (Creature & { look?: string })[] }>('runs/shared/crew.json').crew.map(({ look: _look, ...c }) => c);
  const run = assemble(content, read<Assembly>(`${dir}/assembly.json`), crew, sites.map(s => read<SiteGraph>(s.file)));
  mkdirSync(`public/runs/${run.id}`, { recursive: true });
  writeFileSync(`public/runs/${run.id}/run.json`, JSON.stringify(run));
  if (process.argv.includes('--open')) {
    const opens = `${run.id}T13:00:00Z`;
    writeFileSync('public/manifest.json', JSON.stringify({ runId: run.id, opensAt: opens, nextOpensAt: new Date(Date.parse(opens) + 86400000).toISOString().replace('.000', ''), runUrl: `/runs/${run.id}/run.json`, voided: [] }, null, 2) + '\n');
  }
  console.log(`Built ${run.id}: ${run.acts.length} acts, ${run.acts.flatMap(a => a.nodes).length} rooms, ${run.acts.flatMap(a => a.creatures).length} creatures`);
}
