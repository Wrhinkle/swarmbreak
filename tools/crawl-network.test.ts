import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { allowed, crawl, parsePage, parseRobots, publicRequest, readLimited } from './crawl';

describe('empty robots responses', () => {
  it.each([204, 205])('crawls pages after HTTP %i robots.txt', async status => {
    vi.useFakeTimers();
    mocks.lookup.mockReset(); mocks.request.mockReset();
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mocks.request.mockImplementation((url: URL, _options, callback) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
        res.statusCode = url.pathname === '/robots.txt' ? status : 200;
        res.headers = { 'content-type': 'text/html' };
        callback(res);
        res.end(url.pathname === '/' ? [1, 2, 3, 4].map(n => `<a href="/page${n}">Page</a>`).join('') : '<p>Page</p>');
      };
      return req;
    });
    try {
      const result = crawl('https://example.com/');
      await vi.runAllTimersAsync();
      expect((await result).pages).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('crawler DNS pinning', () => {
  beforeEach(() => { mocks.lookup.mockReset(); mocks.request.mockReset(); });
  it('rejects a mixed DNS response without connecting', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(publicRequest(new URL('https://example.com/robots.txt'))).rejects.toThrow('not public');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('pins the connection and revalidates DNS for a redirected request', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '::1', family: 6 }]);
    mocks.request.mockImplementation((_url, options, callback) => {
      options.lookup('example.com', {}, (error: unknown, address: string, family: number) => {
        expect(error).toBeNull(); expect(address).toBe('8.8.8.8'); expect(family).toBe(4);
      });
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
        res.statusCode = 302; res.headers = { location: '/next' }; callback(res); res.end();
      };
      return req;
    });
    const first = await publicRequest(new URL('https://example.com/'));
    await expect(publicRequest(new URL(first.headers.get('location')!, 'https://example.com/'))).rejects.toThrow('not public');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});


describe('compressed crawler responses', () => {
  beforeEach(() => {
    mocks.lookup.mockReset(); mocks.request.mockReset();
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });
  function respond(encoding: string, data: Buffer) {
    mocks.request.mockImplementation((_url, _options, callback) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
        res.statusCode = 200; res.headers = { 'content-encoding': encoding }; callback(res); res.end(data);
      };
      return req;
    });
    return publicRequest(new URL('https://example.com/'));
  }
  it.each([
    ['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync],
  ])('decodes %s robots rules and HTML links', async (encoding, compress) => {
    const robots = parseRobots(await readLimited(await respond(encoding, compress('User-agent: *\nDisallow: /private\n'))));
    expect(allowed('/private', robots.rules)).toBe(false);
    const html = await readLimited(await respond(encoding, compress('<a href="/next">Next</a>')));
    expect(parsePage(html, 'https://example.com/').links).toContain('/next');
  });
  it('decodes stacked encodings in reverse order', async () => {
    const response = await respond('gzip, br', brotliCompressSync(gzipSync('hello')));
    expect(await readLimited(response)).toBe('hello');
  });
  it('rejects invalid or unsupported encodings and limits decoded bytes', async () => {
    const response = respond;
    await expect(readLimited(await response('gzip', Buffer.from('invalid')))).rejects.toThrow();
    await expect(response('unknown', Buffer.from('text'))).rejects.toThrow('Unsupported content encoding');
    await expect(readLimited(await response('gzip', gzipSync('x'.repeat(100))), 10)).rejects.toThrow('larger');
  });
});
