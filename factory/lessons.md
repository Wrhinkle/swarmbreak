# Lessons

Every worker reads this before every job. One line per lesson; the coach keeps it current.

- A big job is never a reason to change nothing. Do the next piece, report `partial` with what's left, and the next pass continues it.
- A nested `sandbox-exec` fails inside your own sandbox ("sandbox_apply: Operation not permitted"). That alone isn't a blocker; the host reruns the checks outside it.
- UI work is judged by looking at it. A long word in a big font can wrap mid-word at 390px; size headings with `clamp()` and check both widths.
- During play nothing may sit outside the game stage: footers and credits outside it make the page scroll on phones.
- A worktree has no `factory/.venv`; scripts that need it must use the main checkout's, not fail on a missing path.
- Bot fixes can invalidate balance evidence: choices must be player-feasible and must not use fight-outcome lookahead; justify changes in bot strength and compare typical, expert, and no-edit outcomes on representative runs before and after.
- The gate reviewer reads only the diff. A PR that changes how the bots play puts its before-and-after clear rates in `tools/bot-strength.md`, not only in the PR description.
- Qodo has skipped heads, which cannot pass the merge check; whether image-only or merge-only commits cause skips is unverified. As a precaution, commit screenshots with the change they show, and don't merge main into a PR branch that has no conflict.
- PR #185 at d0deb1d: the local request state records a request at 2026-11-11 01:20:52 UTC and `started: false`; `factory/log/decisions.jsonl` records the start timeout at 02:24:22 UTC. The historical wait code times out when no start was observed for an hour, but neither record establishes why; the PR's request history and Qodo session/service records were unavailable in this offline investigation, so a service failure is unconfirmed. Inspect those records after a timeout and retain the exact-head completed-review merge check.
- When fixing a save migration, compare the PR head's version as well as main's: PR #165's Qodo-fix commit 0e94fee changed the save type and new saves from version 2 to 1 and normalized parsed saves to 1, causing the backward-version finding; its motivation is unconfirmed. Never move the version backward; migrate every previously accepted version and test that their data survives.
- A code-only deploy can leave the manifest unchanged, so matching manifests alone can falsely verify stale code; verify the served build revision matches the deployed commit as well.
