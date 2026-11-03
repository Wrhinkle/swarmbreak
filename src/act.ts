import type { MapNode, NodeKind, SiteGraph, SitePage } from './types';

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildActMap(graph: SiteGraph, seed: number): MapNode[] {
  if (!graph.pages.length) throw new Error('Cannot build an act without pages');
  const random = randomSource(seed);
  const groups = new Map<string, SitePage[]>();
  for (const page of graph.pages) if (page.section !== 'home') groups.set(page.section, [...(groups.get(page.section) || []), page]);
  const sections = shuffle([...groups.keys()].sort(), random);
  const pools = Array.from({ length: 3 }, (_, column) => {
    const assigned = sections.filter((_, index) => index % 3 === column);
    return assigned.flatMap(section => groups.get(section)!);
  });
  for (let i = 0; i < pools.length; i++) if (!pools[i].length) pools[i] = graph.pages;

  const kinds: NodeKind[] = Array(45).fill('fight');
  for (let x = 0; x < 3; x++) kinds[42 + x] = 'rest';
  // Elite and shop rooms are reserved for floors 3 through 13.
  const later = shuffle(Array.from({ length: 33 }, (_, i) => i + 9), random);
  for (const [index, kind] of (['elite', 'elite', 'elite', 'elite', 'shop', 'shop'] as NodeKind[]).entries()) kinds[later[index]] = kind;
  const open = shuffle(Array.from({ length: 39 }, (_, i) => i + 3).filter(i => kinds[i] === 'fight'), random);
  const remaining: NodeKind[] = ['rest', 'rest', ...Array<NodeKind>(7).fill('event'), 'treasure', 'treasure'];
  for (const [index, kind] of remaining.entries()) kinds[open[index]] = kind;

  const nodes: MapNode[] = [];
  for (let floor = 0; floor < 15; floor++) for (let x = 0; x < 3; x++) {
    const pool = pools[x];
    const page = pool[Math.floor(random() * pool.length)];
    const kind = kinds[floor * 3 + x];
    nodes.push({ id: `f${floor}x${x}`, floor, x, kind, label: page.title, sourcePath: page.path,
      next: [floor === 14 ? 'boss' : `f${floor + 1}x${x}`], easy: floor < 3 && kind === 'fight' });
  }
  // Cross-links between neighboring lanes, one direction per gap so paths never cross.
  for (let floor = 0; floor < 14; floor++) for (let x = 0; x < 2; x++) {
    const roll = random();
    if (roll < 0.45) nodes[floor * 3 + x].next.push(`f${floor + 1}x${x + 1}`);
    else if (roll < 0.9) nodes[floor * 3 + x + 1].next.push(`f${floor + 1}x${x}`);
  }
  const home = graph.pages.find(page => page.path === '/');
  const bossPage = home || [...graph.pages].sort((a, b) =>
    b.path.split('/').filter(Boolean).length - a.path.split('/').filter(Boolean).length ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))[0];
  nodes.push({ id: 'boss', floor: 15, x: 1, kind: 'boss', label: bossPage.title, sourcePath: bossPage.path, next: [], easy: false });
  return nodes;
}

export function checkActMap(nodes: MapNode[]): string[] {
  const problems: string[] = [];
  const byId = new Map<string, MapNode>();
  const floors: MapNode[][] = Array.from({ length: 16 }, () => []);
  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`Duplicate node ID: ${node.id}`);
    byId.set(node.id, node);
    if (!Number.isInteger(node.floor) || node.floor < 0 || node.floor > 15) problems.push(`Invalid floor for ${node.id}`);
    else floors[node.floor].push(node);
    if (!Number.isInteger(node.x) || node.x < 0 || node.x > 3) problems.push(`Invalid column for ${node.id}`);
    if (!node.label || !node.sourcePath) problems.push(`Missing page source for ${node.id}`);
    if (!['fight', 'elite', 'rest', 'event', 'shop', 'treasure', 'boss'].includes(node.kind)) problems.push(`Invalid room kind for ${node.id}`);
    if (node.encounter !== undefined || node.eventId !== undefined || node.reward !== undefined) problems.push(`Content already assigned to ${node.id}`);
    if (node.easy !== (node.floor < 3 && node.kind === 'fight')) problems.push(`Incorrect easy flag for ${node.id}`);
    if (node.floor < 3 && (node.kind === 'elite' || node.kind === 'shop')) problems.push(`Early elite or shop at ${node.id}`);
    if (node.floor === 0 && node.kind !== 'fight') problems.push(`Floor 0 must contain only fights: ${node.id}`);
    if (node.floor === 14 && node.kind !== 'rest') problems.push(`Floor 14 must contain only rest rooms: ${node.id}`);
    if (node.floor !== 15 && node.kind === 'boss') problems.push(`Boss on wrong floor: ${node.id}`);
    if (node.floor === 15 && (node.kind !== 'boss' || node.next.length)) problems.push(`Invalid boss: ${node.id}`);
    if (node.floor !== 15 && !node.next.length) problems.push(`Missing outgoing path: ${node.id}`);
  }
  for (let floor = 0; floor < 16; floor++) {
    const count = floors[floor].length;
    if ((floor === 0 && count !== 3) || (floor > 0 && floor < 15 && (count < 2 || count > 4)) || (floor === 15 && count !== 1)) problems.push(`Wrong number of nodes on floor ${floor}`);
    if (new Set(floors[floor].map(n => n.x)).size !== count) problems.push(`Duplicate columns on floor ${floor}`);
  }
  const incoming = new Set<string>();
  for (const node of nodes) for (const id of node.next) {
    const target = byId.get(id);
    if (!target || target.floor !== node.floor + 1) problems.push(`Invalid path from ${node.id} to ${id}`);
    else incoming.add(id);
  }
  for (const node of nodes) if (node.floor > 0 && !incoming.has(node.id)) problems.push(`Unreachable node: ${node.id} has no incoming path`);
  for (let floor = 0; floor < 15; floor++) {
    const row = [...floors[floor]].sort((a, b) => a.x - b.x);
    for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
      const left = row[i].next.map(id => byId.get(id)).filter((n): n is MapNode => !!n && n.floor === floor + 1);
      const right = row[j].next.map(id => byId.get(id)).filter((n): n is MapNode => !!n && n.floor === floor + 1);
      if (left.some(a => right.some(b => a.x > b.x))) problems.push(`Crossed paths from ${row[i].id} and ${row[j].id}`);
    }
  }
  const reachable = new Set<string>(), pending = floors[0].map(node => node.id);
  while (pending.length) {
    const id = pending.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = byId.get(id);
    if (node) for (const next of node.next) if (byId.get(next)?.floor === node.floor + 1) pending.push(next);
  }
  for (const node of nodes) if (node.floor > 0 && !reachable.has(node.id)) problems.push(`Unreachable node from floor 0: ${node.id}`);
  const boss = floors[15][0];
  for (const start of floors[0]) {
    const visited = new Set<string>(), queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = byId.get(id);
      if (node) for (const next of node.next) if (byId.get(next)?.floor === node.floor + 1) queue.push(next);
    }
    if (!boss || !visited.has(boss.id)) problems.push(`Boss unreachable from ${start.id}`);
  }
  const rooms = nodes.filter(n => n.floor >= 0 && n.floor < 15);
  const mix: [NodeKind, number][] = [['fight', .55], ['elite', .08], ['rest', .12], ['event', .15], ['shop', .05], ['treasure', .05]];
  for (const [kind, proportion] of mix) if (Math.abs(rooms.filter(n => n.kind === kind).length - rooms.length * proportion) > Math.max(1.5, rooms.length * .04)) problems.push(`Room mix has the wrong number of ${kind} rooms`);
  return problems;
}
