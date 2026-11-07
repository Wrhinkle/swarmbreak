# ATB bot comparison checkpoint

These paired samples compare the current manual ATB policy with the current Auto policy on the same route seeds. Both use the current equipment heuristic; neither is a comparison against the pre-ATB equipment search. The numbers are preliminary, not balance evidence.

| Run | Policy | Seeds | Auto wins | Manual wins | Manual-only wins | Auto-only wins |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 2026-11-05 | typical | 1–10 | 0/10 | 8/10 | 8 | 0 |
| 2026-11-05 | typical | 11–20 | 2/10 | 9/10 | 7 | 0 |
| 2026-11-05 | no-build | 1–10 | 1/10 | 8/10 | 8 | 1 |
| 2026-11-05 | no-build | 11–30 | 3/20 | 11/20 | 9 | 1 |
| 2026-11-05 | expert | 1–10 | 0/10 | 8/10 | 8 | 0 |
| 2026-11-05 | expert | 11–20 | 3/10 | 10/10 | 7 | 0 |
| 2026-11-04 | typical | 1–10 | 0/10 | 2/10 | 2 | 0 |
| 2026-11-04 | typical | 11–30 | 2/20 | 8/20 | 8 | 2 |
| 2026-11-04 | no-build | 1–10 | 2/10 | 8/10 | 6 | 0 |
| 2026-11-04 | no-build | 11–30 | 2/20 | 14/20 | 12 | 0 |
| 2026-11-04 | expert | 11–30 | 3/20 | 8/20 | 7 | 2 |

Reproduce each row with `npx vite-node tools/compare-atb.ts public/runs/<run>/run.json <count> <starting-seed> <policy>`. Manual choices have a large apparent advantage in these small samples; do not infer a reliable win rate from them. The outstanding work is to collect meaningful samples on representative runs, compare against pre-ATB bots including their former equipment search, and check the next run with the unchanged balance tool. These results do not establish that the run passes the balance gate.

## Preliminary pre-ATB baseline

On 2026-11-04, seeds 11–20, the pre-ATB simulator at commit `ad7ca5c` won 6/10 as typical, 9/10 as expert, and 0/10 with no routine edits. The typical and expert policies use the former fight-result equipment search, so this is a historical comparison, not a player-feasible policy. For those same seeds, current Auto/manual won 2/10 and 3/10 for typical, 1/10 and 5/10 for expert, and 0/10 and 5/10 for no-build. The sample is too small to establish relative strength; route and equipment decisions can diverge after fights.

To reproduce the baseline, extract `src` and `tools/sim.ts` from `ad7ca5c` into a temporary directory, provide the current `node_modules`, and run a `vite-node` script in that directory which loads the current `public/runs/2026-11-04/run.json` and calls `play(run, rng(seed), policy).won` for each seed 11 through 20, using `TYPICAL`, `EXPERT`, and `NO_BUILD` from the extracted simulator. This uses the historical combat engine and equipment search as well as the historical policies.
