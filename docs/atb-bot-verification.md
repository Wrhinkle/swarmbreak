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

Reproduce each row with `npx vite-node tools/compare-atb.ts public/runs/<run>/run.json <count> <starting-seed> <policy>`. Manual choices have a large apparent advantage in these small samples; do not infer a reliable win rate from them. The outstanding work is to collect meaningful samples on representative runs, compare against pre-ATB bots including their former equipment search, and check the next run with the unchanged balance tool. These results do not establish that the run passes the balance gate.
