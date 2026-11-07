// Compare the same bot with and without manual ATB choices on identical route seeds.
// Usage: npx vite-node tools/compare-atb.ts <run.json> [games] [starting seed]
import { readFileSync } from 'node:fs';
import type { Run } from '../src/types';
import { EXPERT, NO_BUILD, TYPICAL, play, rng } from './sim';
import { comparisonRange } from './compare-atb-range';

const [file, countArg, startArg] = process.argv.slice(2);
if (!file) throw new Error('Usage: compare-atb.ts <run.json> [positive game count] [starting seed]');
const { count, start } = comparisonRange(countArg, startArg);
const run = JSON.parse(readFileSync(file, 'utf8')) as Run;
for (const policy of [TYPICAL, EXPERT, NO_BUILD]) {
  let automatic = 0, manual = 0, manualOnly = 0, autoOnly = 0;
  for (let seed = start; seed < start + count; seed++) {
    const a = play(run, rng(seed), { ...policy, action: 'auto' }).won;
    const m = play(run, rng(seed), { ...policy, action: 'manual' }).won;
    automatic += Number(a); manual += Number(m);
    manualOnly += Number(m && !a); autoOnly += Number(a && !m);
  }
  console.log(`${policy.name}: ${count} paired seeds starting at ${start}; Auto ${automatic}/${count}, manual ${manual}/${count}; manual-only ${manualOnly}, Auto-only ${autoOnly}`);
}
