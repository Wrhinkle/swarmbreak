# Lessons

Every worker reads this before every job. One line per lesson; the coach keeps it current.

- A big job is never a reason to change nothing. Do the next piece, report `partial` with what's left, and the next pass continues it.
- A nested `sandbox-exec` fails inside your own sandbox ("sandbox_apply: Operation not permitted"). That alone isn't a blocker; the host reruns the checks outside it.
- UI work is judged by looking at it. A long word in a big font can wrap mid-word at 390px; size headings with `clamp()` and check both widths.
- During play nothing may sit outside the game stage: footers and credits outside it make the page scroll on phones.
- A worktree has no `factory/.venv`; scripts that need it must use the main checkout's, not fail on a missing path.
- Bot fixes can invalidate balance evidence: choices must be player-feasible and must not use fight-outcome lookahead; justify changes in bot strength and compare typical, expert, and no-edit outcomes on representative runs before and after.
