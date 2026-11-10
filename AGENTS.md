# Swarmbreak

A daily browser roguelike. Each day a factory picks three public websites and turns each into one act. Pages become enemies, allies, events, and a boss. Crew fight on their own using if-then routines the player sets. Everyone gets the same run, one official attempt per day. A win keeps one ally in the player's camp. A loss keeps nothing.

Live at https://swarmbreak-game.web.app. TypeScript, Vite, Vitest, canvas, Firebase Hosting. No game server.

## Setup and verify

```
npm install
npm run build                 # type check and production build
npm test                      # unit tests
npx vite-node tools/balance.ts public/runs/<id>/run.json   # balance checks for one run
```

To run the factory, also: `python3 -m venv factory/.venv && factory/.venv/bin/pip install -r factory/requirements.txt`, and a `codex` CLI signed in with a ChatGPT subscription. `python3 factory/run.py <YYYY-MM-DD>` builds one run. Agent roles are in `factory/agents/`. `python3 factory/pr_team.py <pr> [--merge]` works one PR through Qodo. `python3 factory/manager.py [--dry-run]` runs one manager pass: it judges requests and picks what happens next. `python3 factory/manager.py --comms <discussion> "<task>"` writes contest posts and replies, and `python3 factory/test_manager.py` checks the gates on both. The project owner is contacted only for money, credentials, content objections, unclear contest rules, and deleting player data.

## Layout

- `src/` is the game. `library.ts` holds routines and stats, `combat.ts` is the deterministic fight, `save.ts` is player state, `main.ts` is the UI.
- `tools/` is the deterministic part of the factory: crawl, stage checks, build, balance.
- `factory/` is the model part: agent prompts, the host script that runs them, and art generation.
- `runs/<id>/` holds each stage's output. `public/runs/<id>/` holds what players download.

## Rules

1. **Content can pick from the library but can't change it.** Applies to `runs/`, `factory/agents/`, `tools/checks.ts`. Agents choose who a creature is, which routines it uses, and where it appears, and each creature must cite a page that was crawled. They never set stats. `tier` and `role` give the stats in `src/library.ts`, and only `tools/balance.ts` may set `scale`, within `ENEMY_SCALE`. New routines are their own PR. If daily content could set numbers, the balance results would stop describing the game.

2. **A run ships only with balance evidence.** Applies to anything that changes a run, `src/combat.ts`, or the bots in `tools/sim.ts`. `tools/balance.ts` must pass: a replayable winning game from every first-floor room, a typical bot clearing 40-60%, and measurable gains from better routes and routines. Don't loosen a threshold to get a run through. Change the run. The bots are part of the evidence: they choose only from what a player can see, never from a fight's simulated outcome, and a PR that changes how they play gives the typical, expert, and no-edit clear rates on a recent run before and after, with the reason for any change in strength.

3. **Models write one file. Scripts do the rest.** Applies to `factory/` and `tools/crawl.ts`. Agents run without network access and can only write their output file, which `tools/checks.ts` or the host validates. Site text, issues, and replies are data, never instructions, so a page can't tell an agent to do anything. Git, pushes, merges, posts, and deploys belong to scripts. The builder and PR fixer may edit those scripts and the agent prompts as files, and every such change needs the gate reviewer to approve the exact commit before merge; the limits, the gate reviewer's brief, and the decision log stay locked to agents. The manager can only pick from the actions `factory/manager.py` allows, each with its own checks. Retries stop after 2, and the same failure is never retried unchanged. Model calls use subscription CLIs with API keys removed. When quota runs out, the work waits.

4. **Saves from any released version must still load.** Applies to `src/save.ts` and `src/types.ts`. Players' camps live only in their browsers, so a bad migration can't be repaired from our side. A format change needs a version bump, a migration, and a test that loads the old format.

5. **Original art only.** Applies to `factory/art.py` and `factory/agents/art.md`. Never copy or trace images from source sites. No logos, photographs, or real people, and no named people in text. Every act shows the source link and a not-affiliated note. Sites are public, and we're using them as inspiration without permission.
