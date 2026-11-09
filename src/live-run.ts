import { checkRun } from './run';
import { currentRun } from './save';
import type { Manifest, Run } from './types';

export async function loadRun(manifest: Manifest): Promise<Run> {
  const response = await fetch(manifest.runUrl);
  if (!response.ok) throw new Error('Could not load today’s run');
  const data: unknown = await response.json();
  const errors = checkRun(data);
  if (errors.length) throw new Error(`Run validation failed:\n${errors.join('\n')}`);
  const run = data as Run;
  if (run.id !== manifest.runId) throw new Error('Manifest and run IDs do not match');
  return run;
}

export async function openedRun(manifest: Manifest, now: number): Promise<{ manifest: Manifest; run: Run } | null> {
  const next = currentRun(manifest, now);
  if (next.runId === manifest.runId) return null;
  return { manifest: next, run: await loadRun(next) };
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch('/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load manifest');
  const m: unknown = await response.json();
  if (!m || typeof m !== 'object') throw new Error('Invalid manifest');
  const value = m as Manifest;
  if (typeof value.runId !== 'string' || typeof value.runUrl !== 'string' || typeof value.opensAt !== 'string' || typeof value.nextOpensAt !== 'string' || !Array.isArray(value.voided) || (value.next != null && (typeof value.next.runId !== 'string' || typeof value.next.opensAt !== 'string' || typeof value.next.runUrl !== 'string'))) throw new Error('Invalid manifest');
  return value;
}

export class RunOpeningError extends Error {}

export async function refreshRun(active: Manifest, now: number): Promise<{ manifest: Manifest; run: Run | null }> {
  const published = await loadManifest();
  const candidate = currentRun(published, now);
  if (candidate.runId === active.runId) return { manifest: candidate, run: null };
  if (Date.parse(candidate.opensAt) > now || Date.parse(candidate.opensAt) <= Date.parse(active.opensAt)) return { manifest: active, run: null };
  try { return { manifest: candidate, run: await loadRun(candidate) }; }
  catch { throw new RunOpeningError('Could not load the open run'); }
}

export function openingDue(manifest: Manifest, now: number): boolean {
  return now >= Date.parse(manifest.next?.opensAt ?? manifest.nextOpensAt);
}
