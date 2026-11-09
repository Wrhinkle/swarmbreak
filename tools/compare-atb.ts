// Compare the same bot with and without manual ATB choices on identical route seeds.
// Usage: npx vite-node tools/compare-atb.ts <run.json> [games] [starting seed] [typical|expert|no-build]
import { readFileSync } from 'node:fs';
import type { Run } from '../src/types';
import { EXPERT, NO_BUILD, TYPICAL, play, rng } from './sim';
import { comparisonCheckpoint, comparisonPolicies, comparisonRange, comparisonSeeds, pairedWinInterval } from './compare-atb-range';

const [file, countArg, startArg, policyArg, seedsArg] = process.argv.slice(2);
if (!file) throw new Error('Usage: compare-atb.ts <run.json> [positive game count] [starting seed]');
const { count, start } = comparisonRange(countArg, startArg);
const seeds = seedsArg ? comparisonSeeds(readFileSync(seedsArg, 'utf8')) : Array.from({ length: count }, (_, i) => start + i);
const selected = comparisonPolicies(policyArg);
const run = JSON.parse(readFileSync(file, 'utf8')) as Run;
for (const [key, policy] of [['typical', TYPICAL], ['expert', EXPERT], ['no-build', NO_BUILD]] as const) {
  if (!selected.includes(key)) continue;
  let automatic = 0, manual = 0, manualOnly = 0, autoOnly = 0;
  for (const [index, seed] of seeds.entries()) {
    const a = play(run, rng(seed), { ...policy, action: 'auto' }).won;
    const m = play(run, rng(seed), { ...policy, action: 'manual' }).won;
    automatic += Number(a); manual += Number(m);
    manualOnly += Number(m && !a); autoOnly += Number(a && !m);
    const completed = index + 1;
    if (comparisonCheckpoint(completed, seeds.length)) {
      const [low, high] = pairedWinInterval(completed, manualOnly, autoOnly);
      console.log(`${policy.name}: ${completed} paired seeds ${seedsArg ? `from ${seedsArg}` : `starting at ${start}`}; Auto ${automatic}/${completed}, manual ${manual}/${completed}; manual-only ${manualOnly}, Auto-only ${autoOnly}; paired difference bound [${(100 * low).toFixed(1)}%, ${(100 * high).toFixed(1)}%] (95% only for independent random seeds and a fixed sample)`);
    }
  }
}
