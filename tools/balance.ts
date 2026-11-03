// Checks a built run against the balance rules. Tunes enemy scale, proves the run can be cleared, and reports.
// Usage: npx vite-node tools/balance.ts public/runs/<id>/run.json [--tune] [--report path]
import { readFileSync, writeFileSync } from 'node:fs';
import { ENEMY_SCALE } from '../src/library';
import type { Run } from '../src/types';
import { EXPERT, NOVICE, NO_BUILD, NO_ROUTE, TYPICAL, measure, play, rng } from './sim';
import type { Policy, Rate } from './sim';

export const TARGET = { low: 0.4, high: 0.6, spread: 0.2, effect: 0.08, topKiller: 0.45, minFight: 30, maxFight: 120 };
const ACT_GROWTH = 0.2; // each later act's enemies are this much stronger, because the crew has grown

export function withScale(run: Run, scale: number): Run {
  const out = structuredClone(run);
  out.acts.forEach((a, i) => a.creatures.forEach(c => { if (c.tier === 'ally') delete c.scale; else c.scale = +Math.min(ENEMY_SCALE.max, scale * (1 + ACT_GROWTH * i)).toFixed(3); }));
  return out;
}

// Harder enemies lower the win rate, close enough to monotone for a bisection.
export function tune(run: Run, count = 150): number {
  let low = ENEMY_SCALE.min, high = ENEMY_SCALE.max / (1 + ACT_GROWTH * (run.acts.length - 1));
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) / 2, rate = measure(withScale(run, mid), TYPICAL, count).winRate;
    if (rate > (TARGET.low + TARGET.high) / 2) low = mid; else high = mid;
  }
  // Small scale changes can jump the rate, so settle on the nearby value closest to the middle of the target.
  const middle = (TARGET.low + TARGET.high) / 2, base = (low + high) / 2;
  const miss = (scale: number) => Math.abs(measure(withScale(run, scale), TYPICAL, count * 2).winRate - middle);
  const options = [-.06, -.04, -.02, 0, .02, .04, .06].map(d => +Math.max(ENEMY_SCALE.min, base + d).toFixed(3));
  return options.map(scale => ({ scale, off: miss(scale) })).sort((a, b) => a.off - b.off)[0].scale;
}

export interface Witness { start: number; policy: string; seed: number; route: string[] }
// A winning game from each first-floor room. Everything is deterministic, so anyone can replay it.
export function findWitnesses(run: Run, tries = 400): { witnesses: Witness[]; missing: number[] } {
  const witnesses: Witness[] = [], missing: number[] = [];
  for (const start of run.acts[0].nodes.filter(n => n.floor === 0).map(n => n.x)) {
    const policy: Policy = { ...EXPERT, start };
    let found: Witness | undefined;
    for (let seed = 1; seed <= tries && !found; seed++) { const r = play(run, rng(seed), policy); if (r.won) found = { start, policy: 'expert', seed, route: r.route }; }
    if (found) witnesses.push(found); else missing.push(start);
  }
  return { witnesses, missing };
}
export function replays(run: Run, w: Witness): boolean { return play(run, rng(w.seed), { ...EXPERT, start: w.start }).won; }

export interface Report { scale?: number; rates: Rate[]; witnesses: Witness[]; problems: string[] }
// 800 games keeps the noise on a difference of two rates near 2.5 points. At 200 it was about 5, too coarse for the 8-point checks.
export function evaluate(run: Run, count = 800): Report {
  const rate = (p: Policy, n = count) => measure(run, p, n);
  const [novice, noRoute, noBuild, typical, expert] = [rate(NOVICE), rate(NO_ROUTE), rate(NO_BUILD), rate(TYPICAL), rate(EXPERT, Math.min(count, 60))];
  const { witnesses, missing } = findWitnesses(run), problems: string[] = [], pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  for (const start of missing) problems.push(`No winning game found starting from first-floor column ${start}: the run may be impossible from there`);
  for (const w of witnesses) if (!replays(run, w)) problems.push(`Winning game from column ${w.start} did not replay`);
  if (typical.winRate < TARGET.low || typical.winRate > TARGET.high) problems.push(`Typical player clears ${pct(typical.winRate)}; the target is ${pct(TARGET.low)}-${pct(TARGET.high)}`);
  if (expert.winRate - typical.winRate < TARGET.spread) problems.push(`Expert ${pct(expert.winRate)} is too close to typical ${pct(typical.winRate)}: playing well doesn't pay enough`);
  if (typical.winRate - novice.winRate < TARGET.spread) problems.push(`Novice ${pct(novice.winRate)} is too close to typical ${pct(typical.winRate)}: decisions don't matter enough`);
  if (typical.winRate - noRoute.winRate < TARGET.effect) problems.push(`Route choice changes the clear rate by only ${pct(typical.winRate - noRoute.winRate)}`);
  if (typical.winRate - noBuild.winRate < TARGET.effect) problems.push(`Routine edits change the clear rate by only ${pct(typical.winRate - noBuild.winRate)}`);
  const losses = Object.values(typical.killers).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(typical.killers)) if (losses >= 20 && v / losses > TARGET.topKiller) problems.push(`${k} causes ${pct(v / losses)} of typical losses`);
  if (typical.fightSeconds < TARGET.minFight || typical.fightSeconds > TARGET.maxFight) problems.push(`Fights average ${typical.fightSeconds.toFixed(0)} s at 1x; the target is ${TARGET.minFight}-${TARGET.maxFight} s`);
  return { rates: [novice, noRoute, noBuild, typical, expert], witnesses, problems };
}

if (process.argv[1]?.endsWith('vite-node') && process.argv[2]?.endsWith('balance.ts') === false && process.argv[2]) {
  const file = process.argv[2], reportAt = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : '';
  let run = JSON.parse(readFileSync(file, 'utf8')) as Run, scale: number | undefined;
  if (process.argv.includes('--tune')) { scale = tune(run); run = withScale(run, scale); writeFileSync(file, JSON.stringify(run)); }
  const report: Report = { scale, ...evaluate(run) };
  for (const r of report.rates) console.log(`${r.policy}: ${(100 * r.winRate).toFixed(0)}% clear, avg floor ${r.avgFloor.toFixed(1)}, ${r.fightSeconds.toFixed(0)} s per fight; killers: ${Object.entries(r.killers).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`Scale ${scale ?? 'unchanged'}. Winning games: ${report.witnesses.map(w => `column ${w.start} seed ${w.seed}`).join(', ') || 'none'}`);
  if (reportAt) writeFileSync(reportAt, JSON.stringify(report, null, 2) + '\n');
  if (report.problems.length) { console.log('PROBLEMS:\n- ' + report.problems.join('\n- ')); process.exitCode = 1; } else console.log('All balance checks pass.');
}
