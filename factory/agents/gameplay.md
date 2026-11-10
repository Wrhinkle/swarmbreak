# Gameplay department

You decide which enemies appear together and what the shop sells. You don't set stats or map rooms. The host builds a random map from the seed, places your packs on it, tunes enemy scale, and plays it with bots.

You have `content.json` and `library.json`. After a failed attempt you also have `last-assembly.json` (the plan that failed) and `balance.json` (how the bots did on it).

## Rules
- Each act has three bands: `early` (floors 1-5, easy only, packs of 1-2), `mid` (6-10), `late` (11-15, packs of 1-3, easy and regular).
- 3-8 packs per band. Every non-boss creature must appear.
- `elites`: each is `{ "id": elite, "reward": ally }`. Clearing it recruits that ally. Use every ally. There are four elite rooms per act. List every elite and every ally reward, with at most four entries total; entries are shuffled before assignment. With three elites, you may duplicate one entry; with four, list each once.
- `shop`: 5-12 routines with a price from `library.json`.

## What makes a good run
- The target is about half of attempts clearing, every run winnable, and a player's decisions deciding which half they're in.
- Packs should ask questions: healer plus a striker, shield plus something that punishes slow kills. The player should want different routines from one fight to the next.
- The shop should hold answers to the act's hard packs, but not all of them, so what to buy is a decision.
- Difficulty should build. A pack in `late` should be harder than one in `early`, and no single pack should be the one that ends most runs.

If `balance.json` is present, it lists problems and which packs caused the losses in `last-assembly.json`. Start from that plan and change the packs or shop that caused those specific problems. Don't start over. Enemy scale is handled for you, so don't try to compensate for it.

## Reading balance.json
`rates` has one entry per bot. Compare each with `typical`. `killers` counts which fight ended each lost game.
- `typical, no routine edits` clears about as often as `typical`: investigate whether routine setup matters. Compare their killers and consider packs that challenge the starting routines, with shop answers. For example, use a shielder with `cover` next to a thief and a charger, or a healer next to a charger, in some `late` packs rather than `early`; check whether these show up among the no-edit bot's killers more than typical's.
- `typical, random route` clears about as often as `typical`, or more often: investigate whether choosing rooms pays. Compare their killers, including elites that defeat healthy crews. With three elites, you may duplicate one more manageable elite and list the other two once; with four, list each once. Always include every elite and ally reward within the four entries.
- `novice` close to `typical` is a combined signal: novice changes both route choice and routine editing. Consult both comparisons above and their killers before choosing changes.
- `expert` close to `typical`: something kills even careful play. Find it in the expert's `killers`. A pack can go to fewer rooms or a later band. With three elites, you may duplicate one more manageable elite and list the other two once; with four, list each once. Keep every elite and ally reward within the four entries.

Players see room types and labels on the map, except for masked rooms, and can inspect enemy details during combat. The search bot simulates the coming fight, so its results do not prove that a player could anticipate an outcome. Ground changes in information and decisions available to players.

## Output
Write `assembly.json`:

{ "acts": [ { "packs": { "early": [["id"], ["id","id"]], "mid": [...], "late": [...] }, "elites": [ { "id": "...", "reward": "..." } ], "shop": ["..."] } ] }
