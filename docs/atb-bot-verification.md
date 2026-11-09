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

For a future fixed-size independent sample, save the sampled unsigned 32-bit seeds as a JSON array and run `npx vite-node tools/compare-atb.ts public/runs/<run>/run.json 1 1 <policy> <seed-file.json>`. The two numeric arguments are placeholders in seed-file mode. The tool uses the entire list, including repeated draws, for both Auto and manual; retain the same file for each policy and the historical comparison. Generate the list independently before examining results, choose the sample size in advance, and do not treat intermediate checkpoints as fixed-sample confidence bounds. This option supplies a way to run the comparison; it does not make the existing consecutive samples independent or establish balance.

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

After allowing the manual bot to use Sweep to remove a vulnerable enemy before healing, November 7 typical seeds 31–40 produced 3/10 manual and 5/10 Auto wins. Earlier checkpoints reported 4/10 and 5/10, but predate another lethal-attack policy change, so this does not isolate the Sweep change. This small sample does not establish bot strength or balance; the choice uses visible health and shields.

With the same policy, November 7 typical seeds 41–50 produced 4/10 wins for both Auto and manual, with three wins unique to each policy. Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 10 41 typical`. This adds a paired sample for the current policy, but is too small to establish strength or balance and does not compare the historical equipment search.

Additional paired samples on November 7 with the current policy:

| Policy | Seeds | Auto wins | Manual wins | Manual-only | Auto-only |
| --- | --- | ---: | ---: | ---: | ---: |
| typical | 51–70 | 10/20 | 9/20 | 7 | 8 |
| expert | 31–50 | 3/20 | 8/20 | 7 | 2 |
| no-build | 11–30 | 0/20 | 4/20 | 4 | 0 |

Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 20 <first-seed> <policy>`. These consecutive-seed samples compare current Auto and manual decisions with the same current equipment heuristic, not the historical equipment search. They do not establish bot strength or balance.

An additional paired sample on November 7, seeds 71–90, used the current policy:

| Policy | Auto wins | Manual wins | Manual-only | Auto-only |
| --- | ---: | ---: | ---: | ---: |
| typical | 4/20 | 9/20 | 7 | 2 |
| expert | 7/20 | 12/20 | 8 | 3 |
| no-build | 0/20 | 6/20 | 6 | 0 |

Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 20 71 <policy>`. These results use consecutive seeds and compare current Auto and manual policies, not the historical bot. They do not establish a win rate or satisfy the balance gate.

The historical simulator at `ad7ca5c` won 9/20 typical, 16/20 expert, and 0/20 no-build on those same seeds 71–90. The current Auto/manual results in the table above were 4/20 and 9/20 typical, 7/20 and 12/20 expert, and 0/20 and 6/20 no-build. Extending the historical sample through seed 170 gave 49/100 typical, 83/100 expert, and 0/100 no-build. Reproduce with the historical extraction method above and substitute the November 7 run and seed ranges. The old editing bots use fight-result equipment search, and the current and historical paths can diverge, so this comparison does not isolate ATB or establish player-feasible bot strength. These consecutive seeds are not an independent random sample; broader representative comparisons remain to be collected.

The current results now cover the same 100 seeds, 71–170:

| Policy | Historical wins | Current Auto wins | Current manual wins |
| --- | ---: | ---: | ---: |
| typical | 49/100 | 37/100 | 43/100 |
| expert | 83/100 | 41/100 | 50/100 |
| no-build | 0/100 | 0/100 | 25/100 |

The current totals combine the reproduced 71–90 results above with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 80 91 <policy>`. For seeds 91–170, typical had 33 Auto wins, 34 manual wins, 18 manual-only wins and 17 Auto-only wins; expert had 34, 38, 18 and 14 respectively; no-build had 0, 19, 19 and 0. The historical expert's large advantage merits further investigation, but its equipment lookahead and diverging game paths prevent attributing the difference to ATB alone. These consecutive seeds are not a statistical confidence sample or a balance-gate result.

After the manual bot began choosing equipped group healing when it restores more visible health than its single-target heal, the November 7 expert on seeds 71–80 won 5/10 manually and 6/10 on Auto, compared with 4/10 and 6/10 immediately before the change. Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 10 71 expert`. This small consecutive-seed comparison does not establish strength or balance, and the heuristic can trade concentrated healing for greater total healing.

After the subsequent fix to consider group healing without a single-target heal, the same seeds produced 5/10 manual and 3/10 Auto wins for typical (3 manual-only, 1 Auto-only), 5/10 manual and 6/10 Auto wins for expert (2 manual-only, 3 Auto-only), and 4/10 manual and 0/10 Auto wins with no routine edits (4 manual-only). Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 10 71 <policy>` using `typical`, `expert`, or `no-build`. The expert aggregate matches the previous checkpoint; the earlier table only reports typical and no-build results for seeds 71–90, so it cannot isolate this change. These ten consecutive seeds are not enough to establish strength or balance, and the historical equipment search still needs a broader comparison.

On a different released run, November 6, the current typical bot on seeds 171–190 won 4/20 with Auto and 8/20 with manual decisions; 6 wins were manual-only and 2 Auto-only. Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 20 171 typical`. This small consecutive-seed sample compares the current policies only; it does not establish balance or compare the historical bot's equipment search.

On the same November 6 run, the no-routine-edit bot on seeds 171–180 won 0/10 with Auto and 1/10 with manual decisions (one manual-only win). Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 10 171 no-build`. This is likewise a small current-policy comparison, not a historical or balance result.

The current expert on November 6 seeds 171–180 won 0/10 with Auto and 8/10 with manual choices, all manual-only. Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 10 171 expert`. This small sample is not enough to establish strength or balance, and does not include the historical equipment search.

On November 6, a further matched sample covers seeds 201–300 after the group-healing changes:

| Policy | Historical wins | Current Auto wins | Current manual wins | Manual-only | Auto-only |
| --- | ---: | ---: | ---: | ---: | ---: |
| typical | 55/100 | 17/100 | 47/100 | 36 | 6 |
| expert | 99/100 | 10/100 | 51/100 | 48 | 7 |
| no-build | 3/100 | 3/100 | 22/100 | 21 | 2 |

Run `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 100 201 <policy>` for each current policy. The historical results use the extraction method above, substituting November 6 and seeds 201–300. The historical expert's 48-win advantage over current manual play reinforces the gap seen on November 7, but the historical editing policies use fight-result lookahead and routes can diverge. The consecutive seeds are descriptive, not an independent random sample or a balance-gate result. Player-feasible expert improvements and the next run's unchanged balance gate still need investigation.

After the latest Sweep preference change, the same November 6 sample was rerun:

| Policy | Auto wins | Manual wins | Manual-only | Auto-only |
| --- | ---: | ---: | ---: | ---: |
| typical | 17/100 | 46/100 | 35 | 6 |
| expert | 10/100 | 51/100 | 48 | 7 |
| no-build | 3/100 | 22/100 | 21 | 2 |

The typical manual total is one lower than the earlier 47/100; the expert and no-build totals match their earlier values. The commands and limitations above still apply. These aggregate results do not establish the effect of the change or satisfy the balance gate; the historical expert's result includes outcome lookahead.

After the subsequent preference for Sweep against three healthy enemies, the November 6 seeds 201–300 were rerun for all three policies. Typical again won 46/100 manually and 17/100 on Auto (35 manual-only, 6 Auto-only); expert won 51/100 and 10/100 (48 and 7); no-build won 22/100 and 3/100 (21 and 2). Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 100 201 <policy>`. The aggregate counts match the preceding table, though that alone does not prove individual outcomes are unchanged. This is a retrospective consecutive-seed sample on one run, not an independent statistical sample or the required future-run balance gate. The historical expert won 99/100 on these seeds with equipment outcome lookahead, so the gap still cannot be attributed solely to ATB decisions.

A fixed independent sample of 100 unsigned 32-bit seeds, drawn with Python `secrets.randbits(32)` before running the comparisons, is saved in `docs/atb-independent-seeds.json`. On November 7, the historical simulator at `ad7ca5c` won 46/100 typical, 82/100 expert, and 0/100 no-build. Current Auto/manual won 36/100 and 44/100 typical (24 manual-only, 16 Auto-only), and 31/100 and 51/100 expert (38 manual-only, 18 Auto-only). The respective conservative paired 95% bounds for manual minus Auto are [-19.2%, 35.2%] and [-7.2%, 47.2%]. The bounds describe the paired current policies on this run, not the historical comparison or the balance gate. Historical editing bots used fight-result lookahead, and paths can diverge; the 31-win historical expert advantage over current manual play cannot be attributed to ATB alone.

Reproduce current results with `npx vite-node tools/compare-atb.ts public/runs/2026-11-07/run.json 1 1 <policy> docs/atb-independent-seeds.json`. For historical results, use the extraction method above and iterate the saved seed array instead of consecutive seeds. This is one released run; independent samples on other representative runs and the future run's unchanged balance gate remain outstanding.

For no-build on the same sample, current Auto won 0/100 and manual won 28/100 (28 manual-only, 0 Auto-only); the conservative paired 95% bound for manual minus Auto is [0.8%, 55.2%]. This bound is for this fixed sample and run, and does not establish the next run's balance.

The same fixed independent 100-seed sample on the November 6 run produced:

| Policy | Auto wins | Manual wins | Manual-only | Auto-only | Paired 95% bound, manual minus Auto |
| --- | ---: | ---: | ---: | ---: | --- |
| typical | 17/100 | 43/100 | 31 | 5 | [-1.2%, 53.2%] |
| expert | 5/100 | 58/100 | 55 | 2 | [25.8%, 80.2%] |
| no-build | 2/100 | 15/100 | 14 | 1 | [-14.2%, 40.2%] |

Reproduce with `npx vite-node tools/compare-atb.ts public/runs/2026-11-06/run.json 1 1 <policy> docs/atb-independent-seeds.json`. These bounds compare the current policies on this run, using the same current equipment heuristic. They do not compare historical equipment search or establish the future run's balance. The typical and no-build bounds include zero; the expert sample supports an advantage for manual play on this run. The historical expert's outcome lookahead and divergent paths still prevent attributing its earlier advantage to ATB alone.

The historical simulator at `ad7ca5c` was also run on the same fixed independent November 6 sample. Its typical, expert, and no-build policies won 48/100, 98/100, and 2/100 games respectively, compared with the current manual results of 43/100, 58/100, and 15/100 in the preceding table. The historical expert's 40-win advantage includes its fight-result equipment lookahead, and the policies may take different routes, so this comparison does not isolate the cause or establish a player-feasible expert win rate. It does not substitute for the future run's balance gate.

To reproduce, extract `src` and `tools/sim.ts` from `ad7ca5c` as described above, load `public/runs/2026-11-06/run.json` and `docs/atb-independent-seeds.json`, and count `play(run, rng(seed), policy).won` for each of `TYPICAL`, `EXPERT`, and `NO_BUILD`. The same seed list was used for both the historical and current results; it was drawn independently before the comparisons, but is shared across runs.

The same fixed 100-seed sample on the November 5 run gives a third matched comparison:

| Policy | Historical wins | Current Auto wins | Current manual wins | Manual-only | Auto-only | Paired 95% bound, manual minus Auto |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| typical | 48/100 | 12/100 | 74/100 | 65 | 3 | [34.8%, 89.2%] |
| expert | 91/100 | 10/100 | 81/100 | 73 | 2 | [43.8%, 98.2%] |
| no-build | 13/100 | 13/100 | 64/100 | 51 | 0 | [23.8%, 78.2%] |

Reproduce current results with `npx vite-node tools/compare-atb.ts public/runs/2026-11-05/run.json 1 1 <policy> docs/atb-independent-seeds.json`; reproduce the historical results using the extraction method above with this run and seed list. The paired bounds compare current Auto and manual choices on this run, with the same equipment heuristic. The historical editing policies used fight-result lookahead, and routes can diverge; their results do not isolate the effects of ATB. These three released runs are not a substitute for the next run's unchanged balance gate.
