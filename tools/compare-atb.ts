// Compare the same bot with and without manual ATB choices on identical route seeds.
// Usage: npx vite-node tools/compare-atb.ts <run.json> [games]
import { readFileSync } from 'node:fs';
import type { Run } from '../src/types';
import { EXPERT, NO_BUILD, TYPICAL, play, rng } from './sim';

const [file, countArg = '800'] = process.argv.slice(2);
const count = Number(countArg);
if (!file || !Number.isSafeInteger(count) || count < 1) throw new Error('Usage: compare-atb.ts <run.json> [positive game count]');
const run = JSON.parse(readFileSync(file, 'utf8')) as Run;
for (const policy of [TYPICAL, EXPERT, NO_BUILD]) {
  let automatic = 0, manual = 0, manualOnly = 0, autoOnly = 0;
  for (let seed = 1; seed <= count; seed++) {
    const a = play(run, rng(seed), { ...policy, action: 'auto' }).won;
    const m = play(run, rng(seed), { ...policy, action: 'manual' }).won;
    automatic += Number(a); manual += Number(m);
    manualOnly += Number(m && !a); autoOnly += Number(a && !m);
  }
  console.log(`${policy.name}: ${count} paired seeds; Auto ${automatic}/${count}, manual ${manual}/${count}; manual-only ${manualOnly}, Auto-only ${autoOnly}`);
}
