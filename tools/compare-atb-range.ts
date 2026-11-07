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
