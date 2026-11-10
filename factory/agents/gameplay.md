# Gameplay department

You decide which enemies appear together and what the shop sells. You don't set stats or map rooms. The host builds a random map from the seed, places your packs on it, tunes enemy scale, and plays it with bots.

You have `content.json` and `library.json`. After a failed attempt you also have `last-assembly.json` (the plan that failed) and `balance.json` (how the bots did on it).

## Rules
- Each act has three bands: `early` (floors 1-5, easy only, packs of 1-2), `mid` (6-10), `late` (11-15, packs of 1-3, easy and regular).
- 3-8 packs per band. Every non-boss creature must appear.
- `elites`: each is `{ "id": elite, "reward": ally }`. Clearing it recruits that ally. Use every ally. Elite rooms cycle through this list, so listing an elite twice makes it appear more often. Every elite must be listed at least once.
- `shop`: 5-12 routines with a price from `library.json`.

## What makes a good run
- The target is about half of attempts clearing, every run winnable, and a player's decisions deciding which half they're in.
- Packs should ask questions: healer plus a striker, shield plus something that punishes slow kills. The player should want different routines from one fight to the next.
- The shop should hold answers to the act's hard packs, but not all of them, so what to buy is a decision.
- Difficulty should build. A pack in `late` should be harder than one in `early`, and no single pack should be the one that ends most runs.

If `balance.json` is present, it lists problems and which packs caused the losses in `last-assembly.json`. Start from that plan and change the packs or shop that caused those specific problems. Don't start over. Enemy scale is handled for you, so don't try to compensate for it.

## Reading balance.json
`rates` has one entry per bot. Compare each with `typical`. `killers` counts which fight ended each lost game.
- `typical, no routine edits` or `novice` clears about as often as `typical`: the starting routines beat every pack, so nothing the player sets up can matter. The run needs packs the starting routines lose to and the shop answers. Runs that passed had them in `late`: a shielder with `cover` next to a thief and a charger, or a healer next to a charger. Make about three of eight `late` packs like that in each act, and keep them out of `early`. They should lead the killers of the no-edit bot and not of `typical`.
- `typical, random route` clears about as often as `typical`, or more often: choosing rooms well doesn't pay. The typical bot picks elite rooms when its crew is healthy, so look for an elite high in its `killers`. List the act's other elites twice and that one once, so healthy crews mostly meet elites they can beat.
- `expert` close to `typical`: something kills even careful play. Find it in the expert's `killers`. A pack goes to fewer rooms or a later band. An elite gets listed once while the others are listed twice.

## Output
Write `assembly.json`:

{ "acts": [ { "packs": { "early": [["id"], ["id","id"]], "mid": [...], "late": [...] }, "elites": [ { "id": "...", "reward": "..." } ], "shop": ["..."] } ] }
