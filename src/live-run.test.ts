import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openedRun, refreshRun, openingDue, RunOpeningError } from './live-run';
import type { Manifest } from './types';

const run = JSON.parse(readFileSync(new URL('../public/runs/dev/run.json', import.meta.url), 'utf8'));
const manifest: Manifest = { runId: 'old', opensAt: '2026-11-05T13:00:00Z', nextOpensAt: '2026-11-06T13:00:00Z', runUrl: '/old', voided: [], next: { runId: run.id, opensAt: '2026-11-06T13:00:00Z', runUrl: '/next' } };
afterEach(() => vi.unstubAllGlobals());
describe('reserve opening in an open tab', () => {
  it('loads and validates the reserve only after it opens', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => run });
    vi.stubGlobal('fetch', fetcher);
    expect(await openedRun(manifest, Date.parse('2026-11-06T12:59:59Z'))).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await openedRun(manifest, Date.parse('2026-11-06T13:00:00Z')))?.run.id).toBe(run.id);
    expect(fetcher).toHaveBeenCalledWith('/next');
  });
  it('rejects failed, invalid, and mismatched loads so the old run can be retained', async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => ({ ...run, id: 'wrong' }) }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(openedRun(manifest, Date.parse('2026-11-06T13:00:00Z'))).rejects.toThrow();
    }
    expect(manifest.runId).toBe('old');
  });
});

it('discovers later reserves before and after opening, and retains the active run on failures', async () => {
  const b = { ...run, id: 'b' }, c = { ...run, id: 'c' };
  const a: Manifest = { ...manifest, runId: 'a', next: { runId: 'b', runUrl: '/b', opensAt: '2026-11-06T13:00:00Z' } };
  const deployed: Manifest = { ...a, runId: 'b', opensAt: '2026-11-06T13:00:00Z', next: { runId: 'c', runUrl: '/c', opensAt: '2026-11-07T13:00:00Z' } };
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/manifest.json' ? deployed : url === '/b' ? b : c }));
  vi.stubGlobal('fetch', fetcher);
  const promoted = (await openedRun(a, Date.parse('2026-11-06T13:00:00Z')))!.manifest;
  const scheduled = await refreshRun(promoted, Date.parse('2026-11-07T12:00:00Z'));
  expect(scheduled.manifest.next?.runId).toBe('c');
  expect(scheduled.run).toBeNull();
  expect((await refreshRun(promoted, Date.parse('2026-11-07T14:00:00Z'))).run?.id).toBe('c');
  fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
  await expect(refreshRun(promoted, Date.parse('2026-11-07T14:00:00Z'))).rejects.toThrow();
  expect(promoted.runId).toBe('b');
});


it('waits for a future published current run and flags only due openings', async () => {
  const active = { ...manifest, next: undefined };
  const future = { ...active, runId: run.id, runUrl: '/next', opensAt: '2026-11-06T13:00:00Z' };
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/manifest.json' ? future : run }));
  vi.stubGlobal('fetch', fetcher);
  const before = Date.parse('2026-11-06T12:59:59Z'), at = before + 1000;
  for (const player of ['idle', 'unfinished']) {
    expect((await refreshRun(active, before)).manifest).toEqual(active);
    expect((await refreshRun(active, at)).run?.id, player).toBe(run.id);
  }
  expect(openingDue(active, before)).toBe(false);
  expect(openingDue(active, at)).toBe(true);
  fetcher.mockImplementation(async (url: string) => url === '/manifest.json' ? { ok: true, json: async () => future } : { ok: false, json: async () => ({}) });
  await expect(refreshRun(active, at)).rejects.toBeInstanceOf(RunOpeningError);
});
