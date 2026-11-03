import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SiteGraph, SitePage } from '../src/types';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const ignored = new Set(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript', 'template']);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function children(node: Node): Node[] {
  return 'childNodes' in node ? node.childNodes : [];
}
function content(node: Node): string {
  if ('tagName' in node && ignored.has(node.tagName)) return '';
  if (node.nodeName === '#text' && 'value' in node) return node.value;
  return children(node).map(content).join(' ');
}
function eligible(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol) || url.search) return false;
  const path = url.pathname.toLowerCase();
  if (/(?:^|\/)(?:log-?in|sign-?in|search|cart|account)(?:\/|$|[.;])/.test(path)) return false;
  return !/\.[a-z0-9]{1,10}$/i.test(path) || /\.html?$/i.test(path);
}

const attr = (n: Element, name: string) => n.attrs.find(a => a.name === name)?.value;
function find(node: Node, test: (n: Element) => boolean): Element | undefined {
  if ('tagName' in node && test(node as Element)) return node as Element;
  for (const child of children(node)) { const hit = find(child, test); if (hit) return hit; }
  return undefined;
}

/** Parse with an absolute page URL when available; a path accepts relative links only. */
export function parsePage(html: string, path: string): SitePage {
  const hasOrigin = /^https?:\/\//i.test(path);
  const base = new URL(path, 'https://swarmbreak.invalid/');
  const document = parse(html);
  const headings: string[] = [];
  const links: string[] = [];
  let title = '';
  let body: Node | undefined;
  function walk(node: Node, hidden = false): void {
    if ('tagName' in node) {
      if (['script', 'style', 'noscript', 'template'].includes(node.tagName)) return;
      hidden = hidden || ignored.has(node.tagName);
      if (!hidden && node.tagName === 'title' && !title) title = clean(content(node));
      if (node.tagName === 'body') body = node;
      if (!hidden && /^h[1-6]$/.test(node.tagName)) {
        const heading = clean(content(node));
        if (heading) headings.push(heading);
      }
      if (node.tagName === 'a') {
        const href = (node as Element).attrs.find(a => a.name === 'href')?.value;
        if (href) {
          try {
            const url = new URL(href, base);
            if ((!hasOrigin && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) || url.host !== base.host || !eligible(url)) return;
            if (!links.includes(url.pathname)) links.push(url.pathname);
          } catch { /* Ignore malformed URLs. */ }
        }
      }
    }
    for (const child of children(node)) walk(child, hidden);
  }
  walk(document);
  // Prefer the page's main content, so menus and site chrome stay out of the excerpt and headings.
  const main = find(document, n => (n.tagName === 'main' || n.tagName === 'article' || attr(n, 'role') === 'main' || attr(n, 'id') === 'main-content') && clean(content(n)).length > 40); // skip-link anchors share these ids
  const root = main ?? body;
  if (root) {
    const inMain = (function collect(node: Node): Element[] {
      if ('tagName' in node && (ignored.has(node.tagName) || /banner|menu|breadcrumb/i.test(attr(node as Element, 'class') ?? ''))) return [];
      return [...('tagName' in node ? [node as Element] : []), ...children(node).flatMap(collect)];
    })(root);
    const mainHeadings = !main ? [] : inMain.filter(n => /^h[1-6]$/.test(n.tagName)).map(n => clean(content(n))).filter(Boolean);
    if (mainHeadings.length) headings.splice(0, headings.length, ...mainHeadings);
    const prose = inMain.filter(n => n.tagName === 'p').map(n => clean(content(n))).filter(t => t.length > 40).join(' ');
    body = prose ? { nodeName: '#text', value: prose } as unknown as Node : root;
  }
  const pathname = base.pathname;
  return { path: pathname, title: title || headings[0] || pathname, section: pathname.split('/').filter(Boolean)[0] || 'home', excerpt: clean(body ? content(body) : content(document)).slice(0, 200), headings, links };
}

const MAX_PAGE_BYTES = 3_000_000;
type Rule = { allow: boolean; pattern: string };
type Robots = { rules: Rule[]; delay: number };
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Rule[]; delays: number[] }[] = [];
  let group: typeof groups[number] | undefined;
  let seenDirective = false;
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').match(/^\s*([^:]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase(), value = match[2];
    if (key === 'user-agent') {
      if (!group || seenDirective) { group = { agents: [], rules: [], delays: [] }; groups.push(group); seenDirective = false; }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      seenDirective = true;
      if ((key === 'allow' || key === 'disallow') && value) group.rules.push({ allow: key === 'allow', pattern: value });
      if (key === 'crawl-delay' && /^\d+(?:\.\d+)?$/.test(value)) group.delays.push(Number(value));
    }
  }
  // A group naming this bot replaces the wildcard group, as robots.txt specifies.
  const named = groups.filter(g => g.agents.includes('swarmbreakbot'));
  const applied = named.length ? named : groups.filter(g => g.agents.includes('*'));
  return { rules: applied.flatMap(g => g.rules), delay: Math.max(1, ...applied.flatMap(g => g.delays)) * 1000 };
}
export function allowed(path: string, rules: Rule[]): boolean {
  let best = -1, result = true;
  for (const rule of rules) {
    const anchored = rule.pattern.endsWith('$');
    const pattern = anchored ? rule.pattern.slice(0, -1) : rule.pattern;
    const regex = new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
    const length = pattern.replace(/\*/g, '').length;
    if (regex.test(path) && (length > best || (length === best && rule.allow))) { best = length; result = rule.allow; }
  }
  return result;
}

// Stops reading at the limit, so one huge page can't exhaust memory.
export async function readLimited(response: Response, limit = MAX_PAGE_BYTES): Promise<string> {
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > limit) throw new Error(`Page is larger than ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function crawl(start: string): Promise<SiteGraph> {
  const root = new URL(start);
  if (!['http:', 'https:'].includes(root.protocol)) throw new Error('Expected an HTTP(S) URL');
  const origin = root.origin;
  let lastRequest = 0;
  let delay = 1000;
  async function request(url: URL): Promise<Response> {
    const wait = Math.max(0, lastRequest + delay - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'SwarmbreakBot/0.1 (+https://swarmbreak-game.web.app)' }, signal: AbortSignal.timeout(30000) });
  }
  const robotsResponse = await request(new URL('/robots.txt', origin));
  let robots: Robots;
  if (robotsResponse.status === 404 || robotsResponse.status === 410) robots = { rules: [], delay: 1000 };
  else if (robotsResponse.ok) robots = parseRobots(await robotsResponse.text());
  else throw new Error(`Cannot read robots.txt: HTTP ${robotsResponse.status}`);
  delay = robots.delay;
  const pages: SitePage[] = [], queue = ['/'];
  const seen = new Set(queue), sections = new Map<string, number>();
  while (queue.length && pages.length < 60) {
    const path = queue.shift()!;
    let url = new URL(path, origin);
    const section = url.pathname.split('/').filter(Boolean)[0] || 'home';
    if ((sections.get(section) || 0) >= 8 || !allowed(url.pathname, robots.rules)) continue;
    try {
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects++) {
        if (url.origin !== origin || !eligible(url) || !allowed(url.pathname, robots.rules)) break;
        response = await request(url);
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get('location');
        if (!location || redirects === 5) { response = undefined; break; }
        url = new URL(location, url);
        response = undefined;
      }
      if (!response?.ok || !/^\s*(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) throw new Error(`Not an HTML response (HTTP ${response?.status ?? 'redirect'})`);
      const finalSection = url.pathname.split('/').filter(Boolean)[0] || 'home';
      if ((sections.get(finalSection) || 0) >= 8 || pages.some(p => p.path === url.pathname)) continue;
      const page = parsePage(await readLimited(response), url.href);
      pages.push(page);
      sections.set(finalSection, (sections.get(finalSection) || 0) + 1);
      for (const link of page.links) if (!seen.has(link)) { seen.add(link); queue.push(link); }
    } catch (error) { console.error(`Skipping ${path}: ${String(error)}`); }
  }
  if (pages.length < 5) throw new Error(`Only crawled ${pages.length} pages; at least 5 are required`);
  return { host: root.host, url: origin + '/', crawledAt: new Date().toISOString(), pages };
}

async function main(): Promise<void> {
  const [url, output] = process.argv.slice(2);
  if (!url || !output) throw new Error('Usage: crawl.ts <site URL> <output.json>');
  const graph = await crawl(url);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(graph, null, 2) + '\n');
  console.log(`Wrote ${graph.pages.length} pages to ${output}`);
}
const entry = process.argv[1];
if (entry && (basename(entry) === 'vite-node' || import.meta.url === pathToFileURL(resolve(entry)).href)) main().catch(error => { console.error(error); process.exitCode = 1; });
