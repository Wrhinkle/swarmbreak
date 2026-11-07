# ATB bot comparison checkpoint

These paired samples compare the current manual ATB policy with the current Auto policy on the same route seeds. Both use the current equipment heuristic; neither is a comparison against the pre-ATB equipment search. The numbers are preliminary, not balance evidence.

| Run | Policy | Seeds | Auto wins | Manual wins | Manual-only wins | Auto-only wins |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 2026-11-06 | typical | 1–10 | 2/10 | 4/10 | 2 | 0 |
| 2026-11-06 | typical | 11–30 | 4/20 | 7/20 | 6 | 3 |
| 2026-11-06 | typical | 31–50 | 2/20 | 7/20 | 6 | 1 |
| 2026-11-06 | typical | 51–100 | 7/50 | 22/50 | 18 | 3 |
| 2026-11-06 | expert | 1–10 | 1/10 | 5/10 | 5 | 1 |
| 2026-11-06 | expert | 11–30 | 3/20 | 12/20 | 11 | 2 |
| 2026-11-06 | no-build | 1–10 | 0/10 | 3/10 | 3 | 0 |
| 2026-11-06 | no-build | 11–30 | 0/20 | 6/20 | 6 | 0 |
| 2026-11-05 | typical | 1–10 | 0/10 | 8/10 | 8 | 0 |
| 2026-11-05 | typical | 11–20 | 2/10 | 9/10 | 7 | 0 |
| 2026-11-05 | typical | 21–40 | 2/20 | 12/20 | 11 | 1 |
| 2026-11-05 | no-build | 1–10 | 1/10 | 8/10 | 8 | 1 |
| 2026-11-05 | no-build | 11–30 | 3/20 | 11/20 | 9 | 1 |
| 2026-11-05 | no-build | 31–40 | 2/10 | 9/10 | 7 | 0 |
| 2026-11-05 | expert | 1–10 | 0/10 | 8/10 | 8 | 0 |
| 2026-11-05 | expert | 11–20 | 3/10 | 10/10 | 7 | 0 |
| 2026-11-05 | expert | 21–40 | 4/20 | 14/20 | 11 | 1 |
| 2026-11-05 | typical | 41–50 | 2/10 | 5/10 | 5 | 2 |
| 2026-11-05 | no-build | 41–50 | 2/10 | 5/10 | 5 | 2 |
| 2026-11-05 | expert | 41–60 | 2/20 | 15/20 | 15 | 2 |
| 2026-11-05 | typical | 51–70 | 5/20 | 13/20 | 10 | 2 |
| 2026-11-05 | no-build | 51–70 | 2/20 | 14/20 | 12 | 0 |
| 2026-11-05 | expert | 61–80 | 7/20 | 16/20 | 9 | 0 |
| 2026-11-04 | typical | 1–10 | 0/10 | 2/10 | 2 | 0 |
| 2026-11-04 | typical | 11–30 | 2/20 | 8/20 | 8 | 2 |
| 2026-11-04 | typical | 31–50 | 6/20 | 8/20 | 7 | 5 |
| 2026-11-04 | typical | 51–60 | 4/10 | 6/10 | 4 | 2 |
| 2026-11-04 | typical | 61–70 | 1/10 | 4/10 | 4 | 1 |
| 2026-11-04 | typical | 71–80 | 2/10 | 2/10 | 1 | 1 |
| 2026-11-04 | typical | 81–100 | 3/20 | 11/20 | 9 | 1 |
| 2026-11-04 | no-build | 1–10 | 2/10 | 8/10 | 6 | 0 |
| 2026-11-04 | no-build | 11–30 | 2/20 | 14/20 | 12 | 0 |
| 2026-11-04 | no-build | 31–50 | 3/20 | 10/20 | 9 | 2 |
| 2026-11-04 | no-build | 51–60 | 1/10 | 7/10 | 6 | 0 |
| 2026-11-04 | expert | 11–30 | 3/20 | 8/20 | 7 | 2 |
| 2026-11-04 | expert | 31–50 | 0/20 | 9/20 | 9 | 0 |
| 2026-11-04 | expert | 51–70 | 2/20 | 8/20 | 6 | 0 |

Reproduce each row with `npx vite-node tools/compare-atb.ts public/runs/<run>/run.json <count> <starting-seed> <policy>`. Manual choices have a large apparent advantage in these small samples; do not infer a reliable win rate from them. The outstanding work is to collect meaningful samples on representative runs, compare against pre-ATB bots including their former equipment search, and check the next run with the unchanged balance tool. These results do not establish that the run passes the balance gate.

The comparison tool also prints a conservative Hoeffding bound on the paired win-rate difference. Its 95% coverage requires independent random seeds and a fixed sample size; the consecutive seeds and intermediate checkpoints here do not establish those assumptions and are not a confidence claim.

## Preliminary pre-ATB baseline

On 2026-11-04, seeds 11–20, the pre-ATB simulator at commit `ad7ca5c` won 6/10 as typical, 9/10 as expert, and 0/10 with no routine edits. The typical and expert policies use the former fight-result equipment search, so this is a historical comparison, not a player-feasible policy. For those same seeds, current Auto/manual won 2/10 and 3/10 for typical, 1/10 and 5/10 for expert, and 0/10 and 5/10 for no-build. The sample is too small to establish relative strength; route and equipment decisions can diverge after fights.

To reproduce the baseline, extract `src` and `tools/sim.ts` from `ad7ca5c` into a temporary directory, provide the current `node_modules`, and run a `vite-node` script in that directory which loads the current `public/runs/2026-11-04/run.json` and calls `play(run, rng(seed), policy).won` for each seed 11 through 20, using `TYPICAL`, `EXPERT`, and `NO_BUILD` from the extracted simulator. This uses the historical combat engine and equipment search as well as the historical policies.

For seeds 31–50 on the same run, the historical simulator won 16/20 typical, 19/20 expert, and 3/20 no-build. Current Auto/manual won 6/20 and 8/20 typical, 0/20 and 9/20 expert, and 3/20 and 10/20 no-build. The old typical and expert results include fight-result lookahead; these paired seeds do not isolate the effects of equipment, routing, and combat choices. They are still too few to establish balance.

On 2026-11-05, seeds 41–50, the same historical simulator won 5/10 typical, 10/10 expert, and 2/10 no-build. Current Auto/manual won 2/10 and 5/10 typical, 0/10 and 9/10 expert, and 2/10 and 5/10 no-build. Reproduce the historical results using the extraction method above, substituting the November 5 run and seeds 41–50. This additional small sample is subject to the same policy and lookahead limitations and does not establish balance.

On 2026-11-05, seeds 51–70, the historical simulator won 12/20 typical and 2/20 no-build; current Auto/manual won 5/20 and 13/20 typical and 2/20 and 14/20 no-build. On seeds 61–80, historical expert won 17/20 and current Auto/manual won 7/20 and 16/20. Reproduce using the extraction method above and these seed ranges. These results include the historical equipment search and do not isolate the effects of equipment, routing, and combat choices. The samples remain insufficient to establish balance.

## November 7 checkpoint

The November 7 run is now in the checkout. On seeds 1–10, the current typical bot won 8/10 with Auto and 2/10 with manual decisions; all six differing results favored Auto. Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 10 1 typical`. This small, consecutively seeded sample does not establish a win rate, but it differs from earlier samples and warrants a larger investigation before changing bot decisions. It does not compare with the historical equipment search or establish that the run passes balance.

On the same seeds, the current expert bot won 4/10 with Auto and 5/10 with manual decisions (3 manual-only, 2 Auto-only). Use the same command with `expert` in place of `typical`. This is likewise only a preliminary sample.

For typical seeds 11–30, Auto won 7/20 and manual won 4/20 (1 manual-only and 4 Auto-only). Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 20 11 typical`. Together with seeds 1–10, this is 15/30 Auto and 6/30 manual; it remains a small consecutive-seed sample, not evidence that the balance thresholds pass. These results make the manual policy worth investigating across more runs and seeds before changing it.

For expert seeds 11–30, Auto won 5/20 and manual won 6/20 (3 manual-only and 2 Auto-only). Use the same command with `expert` in place of `typical`. This small sample does not establish relative strength or balance.

For no-routine-edit seeds 1–10, Auto won 0/10 and manual won 3/10 (3 manual-only). Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 10 1 no-build`. This small sample does not establish relative strength or balance.

On November 7, seeds 31–40, the typical bot won 3/10 manually and 5/10 on Auto both before and after changing the manual policy to prefer an equipped heavy attack over an earlier Strike. This paired sample is too small to establish the change's effect on strength. The policy still uses only equipped routines and visible targets; further comparisons for all policies and representative runs remain necessary.

After correcting target ranking when switching from heavy to Breach, the same seeds again produced 3/10 manual and 5/10 Auto wins. The preceding baseline predates other Breach policy improvements, so this does not isolate the target-ranking change. The sample is too small to establish its effect on strength.

After choosing a lethal equipped attack over healing when only one enemy remains, seeds 31–40 produced 4/10 manual and 5/10 Auto wins. Before that change, the same sample produced 3/10 manual and 5/10 Auto wins. This small consecutive-seed sample does not establish the change's effect on bot strength or balance.

After choosing a heavy attack ahead of an earlier Breach against unshielded targets, November 7 typical seeds 31–40 again produced 4/10 manual and 5/10 Auto wins. This matches the preceding small sample, but does not establish the policy's effect on strength or balance. The change uses equipped routines and visible shields; it does not change the balance gates.

After teaching the manual bot to use Breach against a shielded foe it can defeat when its best heavy-attack target would survive, November 7 typical seeds 31–40 again produced 4/10 manual and 5/10 Auto wins. This matches the previous checkpoint but is too small to establish the change's effect on strength or balance. The choice uses visible health and shields; balance gates are unchanged.

After adding the choice to finish all remaining enemies with Sweep when their visible health and shields allow it, November 7 typical seeds 31–40 again produced 4/10 manual and 5/10 Auto wins. This matches the preceding small sample and does not establish the policy's effect on strength or balance. The bot uses equipped actions and visible fighter state; balance gates are unchanged.
