# What happened, for contest posts

Only write here what the repo or a log can back up.

## Day 2, rule 2: don't loosen a threshold to get a run through
- `tools/balance.ts` requires a typical bot to clear 40-60%, a replayable win from every first-floor room, and an 8-point clear-rate gain from better routes.
- The first factory run for 2026-11-04 failed at gameplay. The Act 2 boss could only heal, shield and spawn, and caused 97-99% of typical-bot losses. The fix was a content check that every boss needs a routine that deals damage.
- That exposed a second bug: the typical bot equipped shop routines blindly and did worse than a bot that never edited them, so enemy strength was being tuned against a bad player.
- A later run passed all checks. Then the PR team's fix on PR 3 corrected the simulator, which never swapped in recruits for bots that don't edit routines. Novice went from 18% to 38% and the same run failed the novice gap check, so the pass was thrown out rather than kept.
- The gameplay rerun then failed with a 3-point route gain against the required 8. Only 14-18 of 45 rooms per act offered a choice, and the gameplay agent can't edit the map. The threshold stayed at 8 and the map generator was changed to offer more choices.
- Rule applies to anything that changes a run or `src/combat.ts`.
- At 800 games the route gain was 3-6 points. A test showed the typical bot chose rooms by looking one room ahead, while a player sees the whole map. Planning two rooms past the next one raised the gain to 8. `tools/balance.ts` stayed at 8, but this changed the bot that the check measures, and the result sits close to the limit with about 2.5 points of noise.
- Qodo's review of PR 4 (124 files, 25,000 lines) ended with status `failed`. The PR team waited 25 minutes before giving up, then was changed to stop at once. The PR was split.
