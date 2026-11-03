import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { publicRequest } from './crawl';

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
