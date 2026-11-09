// Inclusive seed ranges allow long paired comparisons to be split into reproducible batches.
export function comparisonRange(countArg = '800', startArg = '1'): { count: number; start: number } {
  const count = Number(countArg), start = Number(startArg);
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(start) || start < 1 || start + count - 1 > 0xffffffff) {
    throw new Error('Usage: compare-atb.ts <run.json> [positive game count] [starting seed] (seeds must fit in 32 bits)');
  }
  return { count, start };
}

export function comparisonPolicies(policy?: string): string[] {
  const policies = ['typical', 'expert', 'no-build'];
  if (policy === undefined) return policies;
  if (!policies.includes(policy)) throw new Error('Policy must be typical, expert, or no-build');
  return [policy];
}

// An externally sampled, fixed list lets the same independent seeds be used
// for every policy and historical baseline. Repeated values are valid draws.
export function comparisonSeeds(json: string): number[] {
  const seeds: unknown = JSON.parse(json);
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error('Seed file must contain a nonempty JSON array of unsigned 32-bit integers');
  }
  return seeds;
}

// Emit cumulative totals during long comparisons so an interrupted batch can
// be resumed at the next seed without losing completed evidence.
export function comparisonCheckpoint(completed: number, count: number): boolean {
  return completed === count || completed % 10 === 0;
}

// Hoeffding's conservative 95% interval, assuming independent random seeds and
// a fixed sample size. Each paired seed contributes -1, 0, or 1. Consecutive
// deterministic seeds and interim checkpoints do not establish those assumptions.
export function pairedWinInterval(count: number, manualOnly: number, autoOnly: number): [number, number] {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(manualOnly) || !Number.isSafeInteger(autoOnly) || manualOnly < 0 || autoOnly < 0 || manualOnly + autoOnly > count) throw new Error('Invalid paired results');
  const difference = (manualOnly - autoOnly) / count;
  const margin = Math.sqrt(2 * Math.log(40) / count);
  return [Math.max(-1, difference - margin), Math.min(1, difference + margin)];
}
