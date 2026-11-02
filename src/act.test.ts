import { describe, expect, it } from 'vitest';
import { buildActMap, checkActMap } from './act';
import { parsePage } from '../tools/crawl';
import type { SiteGraph } from './types';

const graph: SiteGraph = {
  host: 'example.org', url: 'https://example.org/', crawledAt: '2026-01-01T00:00:00Z',
  pages: Array.from({ length: 60 }, (_, i) => ({
    path: i === 0 ? '/' : `/section${i % 6}/page${i}`, title: `Page ${i}`,
    section: i === 0 ? 'home' : `section${i % 6}`, excerpt: '', headings: [],
    links: i < 59 ? [`/section${(i + 1) % 6}/page${i + 1}`] : [],
  })),
};

describe('parsePage', () => {
  it('extracts safe content and same-site links without executing markup', () => {
    const page = parsePage(`<title>Example</title><body><nav><h1>Hidden nav</h1><a href="/nav">Navigate</a></nav><h1>Welcome</h1><p>${'safe '.repeat(80)}</p><script>globalThis.compromised = true</script><style>hidden css</style><img src=x onerror="globalThis.compromised=true"><footer><h2>Hidden footer</h2>footer text</footer><a href="/inside">In</a><a href="https://example.org/other">Other</a><a href="https://evil.example/out">Out</a><a href="/search?q=bad">Search</a></body>`, 'https://example.org/start');
    expect(page.title).toBe('Example');
    expect(page.headings).toEqual(['Welcome']);
    expect(page.excerpt.length).toBeLessThanOrEqual(200);
    expect(page.excerpt).not.toMatch(/Hidden|compromised|footer|css|Navigate/);
    expect(page.links).toEqual(['/nav', '/inside', '/other']);
    expect((globalThis as typeof globalThis & { compromised?: boolean }).compromised).toBeUndefined();
  });
  it('handles a path without assuming the origin of absolute links', () => {
    expect(parsePage('<a href="next">Next</a><a href="https://evil.example/a">Bad</a>', '/dir/page').links).toEqual(['/dir/next']);
  });
});

describe('buildActMap', () => {
  it('produces valid acts for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) expect(checkActMap(buildActMap(graph, seed)), `seed ${seed}`).toEqual([]);
  });
  it('detects unreachable nodes, crossed paths, and a wrong floor 14', () => {
    const map = buildActMap(graph, 1);
    map.find(n => n.id === 'f0x0')!.next = ['f1x2'];
    map.find(n => n.id === 'f14x0')!.kind = 'fight';
    const errors = checkActMap(map).join('\n');
    expect(errors).toMatch(/unreachable node/i);
    expect(errors).toMatch(/crossed paths/i);
    expect(errors).toMatch(/floor 14/i);
  });
  it('is deterministic and varies with the seed', () => {
    expect(JSON.stringify(buildActMap(graph, 123))).toBe(JSON.stringify(buildActMap(graph, 123)));
    expect(JSON.stringify(buildActMap(graph, 123))).not.toBe(JSON.stringify(buildActMap(graph, 124)));
  });
});
