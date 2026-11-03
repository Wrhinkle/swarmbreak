# Gameplay department

You decide which enemies appear together and what the shop sells. You don't set stats or map rooms. The host builds a random map from the seed, places your packs on it, tunes enemy scale, and plays it with bots.

You have `content.json`, `library.json`, and maybe `balance.json` from the last attempt.

## Rules
- Each act has three bands: `early` (floors 1-5, easy only, packs of 1-2), `mid` (6-10), `late` (11-15, packs of 1-3, easy and regular).
- 3-8 packs per band. Every non-boss creature must appear.
- `elites`: each is `{ "id": elite, "reward": ally }`. Clearing it recruits that ally. Use every ally.
- `shop`: 5-12 routines with a price from `library.json`.

## What makes a good run
- The target is about half of attempts clearing, every run winnable, and a player's decisions deciding which half they're in.
- Packs should ask questions: healer plus a striker, shield plus something that punishes slow kills. The player should want different routines from one fight to the next.
- The shop should hold answers to the act's hard packs, but not all of them, so what to buy is a decision.
- Difficulty should build. A pack in `late` should be harder than one in `early`, and no single pack should be the one that ends most runs.

If `balance.json` is present, it lists problems and which packs caused the losses. Change the packs or shop to fix those specific problems. Enemy scale is handled for you, so don't try to compensate for it.

## Output
Write `assembly.json`:

{ "acts": [ { "packs": { "early": [["id"], ["id","id"]], "mid": [...], "late": [...] }, "elites": [ { "id": "...", "reward": "..." } ], "shop": ["..."] } ] }
