import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
export interface Room { id: number; name: string; text: string; x: number; y: number; width: number; height: number; kind: 'entrance' | 'main' | 'side' | 'exit' }
export interface Path { from: number; to: number; shortcut: boolean }
export interface Act { title: string; sourceUrl: string; rooms: Room[]; paths: Path[]; entrance: number; exit: number }

const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : [];
const tag = (node: Node): string => 'tagName' in node ? node.tagName : '';
const attr = (node: Node, name: string): string | undefined => 'attrs' in node ? (node as Element).attrs.find(a => a.name === name)?.value : undefined;
const ignored = new Set(['script', 'style', 'template', 'noscript', 'img', 'svg']);
function find(node: Node, predicate: (node: Node) => boolean): Node | undefined {
  if (predicate(node)) return node;
  for (const child of children(node)) { const found = find(child, predicate); if (found) return found; }
}
function textOf(node: Node): string {
  if (ignored.has(tag(node))) return '';
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return children(node).map(textOf).join(' ');
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const omitted = new Set(['see also', 'notes', 'references', 'citations', 'sources', 'bibliography', 'further reading', 'external links']);
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(s)) { h ^= byte; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function generateAct(html: string, sourceUrl: string): Act {
  const document = parse(html);
  const content = find(document, n => attr(n, 'id') === 'mw-content-text') ?? find(document, n => tag(n) === 'main') ?? find(document, n => tag(n) === 'article') ?? find(document, n => tag(n) === 'body') ?? document;
  const titleNode = find(document, n => tag(n) === 'h1') ?? find(document, n => tag(n) === 'title');
  const title = clean(titleNode ? textOf(titleNode) : '') || 'Unknown page';
  const rooms: Room[] = [];
  const paths: Path[] = [];
  const links: (string | undefined)[] = [];
  const addRoom = (name: string, kind: Room['kind'], column: number, row: number) => {
    const id = rooms.length;
    rooms.push({ id, name, text: '', x: column * 280, y: row * 160, width: 160, height: 90, kind });
    return id;
  };
  const connect = (from: number, to: number, shortcut = false) => paths.push({ from, to, shortcut });
  const entrance = addRoom(title, 'entrance', 0, 0);
  let current = entrance, parent = entrance, lastMain = entrance, column = 0, sideRow = 0, skipping = false;
  function walk(node: Node): void {
    const name = tag(node);
    if (ignored.has(name)) return;
    if (name === 'h2' || name === 'h3') {
      const heading = clean(textOf(node));
      if (name === 'h2') {
        skipping = omitted.has(heading.toLowerCase());
        if (!skipping && heading) { column++; sideRow = 0; parent = addRoom(heading, 'main', column, 0); connect(lastMain, parent); lastMain = parent; current = parent; }
      } else if (!skipping && heading && parent !== entrance && !omitted.has(heading.toLowerCase())) {
        current = addRoom(heading, 'side', column, ++sideRow); connect(parent, current);
      } else if (name === 'h3' && omitted.has(heading.toLowerCase())) { current = -1; }
      return;
    }
    if (!skipping && current >= 0 && name === 'a' && links[current] === undefined) {
      const href = attr(node, 'href');
      if (href && /^(https?:|\/)/i.test(href)) links[current] = href;
    }
    if (!skipping && current >= 0 && node.nodeName === '#text') rooms[current].text += ` ${(node as DefaultTreeAdapterMap['textNode']).value}`;
    for (const child of children(node)) walk(child);
  }
  walk(content);
  if (lastMain === entrance) { lastMain = addRoom('Exit', 'exit', 1, 0); connect(entrance, lastMain); }
  else rooms[lastMain].kind = 'exit';
  for (const room of rooms) {
    room.text = clean(room.text);
    const size = Math.min(1, room.text.length / 4000);
    room.width = Math.round(160 + size * 60);
    room.height = Math.round(90 + size * 40);
  }
  let shortcuts = 0;
  for (const room of rooms) {
    if (shortcuts >= Math.floor(rooms.length / 3)) break;
    const href = links[room.id];
    if (!href) continue;
    const target = hash(href) % rooms.length;
    if (target === room.id || paths.some(p => (p.from === room.id && p.to === target) || (p.to === room.id && p.from === target))) continue;
    connect(room.id, target, true); shortcuts++;
  }
  return { title, sourceUrl, rooms, paths, entrance, exit: lastMain };
}

export function exitReachable(act: Act): boolean {
  const visited = new Set<number>([act.entrance]);
  const queue = [act.entrance];
  for (let i = 0; i < queue.length; i++) {
    const room = queue[i];
    if (room === act.exit) return true;
    for (const path of act.paths) {
      const next = path.from === room ? path.to : path.to === room ? path.from : undefined;
      if (next !== undefined && !visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return false;
}
