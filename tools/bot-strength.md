# Bot strength log

AGENTS.md rule 2: a change to how the balance bots play gives the typical, expert and no-edit clear rates on a recent run, before and after, with the reason for any change in strength. The gate reviewer reads the diff, so the numbers go here. Newest first.

## 2026-11-10: smart routes avoid fights that look heavier than usual

The map now shows each visible fight's enemies and a threat number (`threat` in `src/combat.ts`: each enemy's health times its power, summed, in hundreds). The smart route in `tools/sim.ts` reads that number. A visible fight whose threat is above the act's average loses `2 * (threat / average - 1)` from its score. A lighter fight gains nothing, so threat never ranks a fight above treasure, a shop or a rest. Mystery rooms and the boss are left out: the map hides the first and every route ends at the second. The bot reads only what the map shows before the choice. It never runs a fight to choose.

Clear rates at each run's shipped difficulty, `npx vite-node tools/balance.ts <run.json>` without `--tune`, 800 games per bot and 60 for expert:

| Run | Bot | Typical | Expert | No edits | Random route | Route margin | Checks |
|---|---|---|---|---|---|---|---|
| 2026-11-09 | before | 48.9% | 81.7% | 15.0% | 31.9% | 17.0 | pass |
| 2026-11-09 | after | 54.1% | 85.0% | 12.1% | 31.9% | 22.2 | pass |
| 2026-11-10 | before | 51.5% | 98.3% | 0.4% | 41.6% | 9.9 | pass |
| 2026-11-10 | after | 50.4% | 100.0% | 0.6% | 41.6% | 8.8 | pass |

Strength: typical moves +5.2 and -1.1 points, expert +3.3 and +1.7, no edits -2.9 and +0.2. Noise on a difference is about 2.5 points at 800 games and larger for expert at 60. The gain comes from skipping heavy packs the old bot walked into blind. The random-route bot doesn't route, so it is unchanged.

Effect on the checks: the typical bot sets the difficulty, and a stronger typical bot makes `--tune` raise enemy scale. On nine candidate maps for 2026-11-10, each tuned with `--tune`, the average scale went from 0.809 to 0.827, so new runs come out slightly harder, not easier. The route check (typical beats random route by 8 points) passed on 1 of the 9 before and 5 of the 9 after, and all checks passed on 0 before and 4 after. No threshold changed. The route check passes more often because the bot now uses what a player can see, which is the reason for the change.

Known limits: on one candidate with a summoning elite the threat number undersells the pack and the smart route loses to the random one by 24 points; that map fails before and after. A two-sided version, where a light fight also gained score, was measured and dropped: it took fights over treasure and typical fell to 40.4% and 47.8% on the two runs above.
