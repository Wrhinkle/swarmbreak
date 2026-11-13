# Template CRLF investigation

Issue #209 asked for PR #171's review and failure history before changing the checks. The local Git commit `cf379e7` says GitHub discussion bodies used CRLF and the LF-only fence caused both template checks to miss their block. That commit normalized `challenge` in `thread()` and added a test through that entry point.

The local factory decision log records a Qodo findings request failing with `MT-UPSTREAM-DOWN` on 2026-11-10 and a gate rejection on 2026-11-11: the added test called `m.thread` before importing `m`, causing a `NameError`. The current tests import the checked functions before use and exercise both line endings through `check_post`. The local log does not establish the complete review history; GitHub review comments and Qodo session records still need inspection when available.

The current shared fence matcher accepts LF and CRLF at the point both template parsers read the challenge. Like normalization in `thread()`, this addresses the reported fence mismatch; unlike normalization, it also handles CRLF challenges supplied directly to the parsers without altering the thread text. The existing tests check required headings, link labels, and posting checks for both line endings. No review or posting gate was relaxed.
