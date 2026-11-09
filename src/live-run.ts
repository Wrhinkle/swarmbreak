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
