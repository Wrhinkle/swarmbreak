// Compare the same bot with and without manual ATB choices on identical route seeds.
// Usage: npx vite-node tools/compare-atb.ts <run.json> [games] [starting seed] [typical|expert|no-build]
import { readFileSync } from 'node:fs';
import type { Run } from '../src/types';
import { EXPERT, NO_BUILD, TYPICAL, play, rng } from './sim';
import { comparisonCheckpoint, comparisonPolicies, comparisonRange } from './compare-atb-range';

const [file, countArg, startArg, policyArg] = process.argv.slice(2);
if (!file) throw new Error('Usage: compare-atb.ts <run.json> [positive game count] [starting seed]');
const { count, start } = comparisonRange(countArg, startArg);
const selected = comparisonPolicies(policyArg);
const run = JSON.parse(readFileSync(file, 'utf8')) as Run;
for (const [key, policy] of [['typical', TYPICAL], ['expert', EXPERT], ['no-build', NO_BUILD]] as const) {
  if (!selected.includes(key)) continue;
  let automatic = 0, manual = 0, manualOnly = 0, autoOnly = 0;
  for (let seed = start; seed < start + count; seed++) {
    const a = play(run, rng(seed), { ...policy, action: 'auto' }).won;
    const m = play(run, rng(seed), { ...policy, action: 'manual' }).won;
    automatic += Number(a); manual += Number(m);
    manualOnly += Number(m && !a); autoOnly += Number(a && !m);
    const completed = seed - start + 1;
    if (comparisonCheckpoint(completed, count)) console.log(`${policy.name}: ${completed} paired seeds starting at ${start}; Auto ${automatic}/${completed}, manual ${manual}/${completed}; manual-only ${manualOnly}, Auto-only ${autoOnly}`);
  }
}
