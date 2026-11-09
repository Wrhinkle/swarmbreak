import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openedRun } from './live-run';
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
