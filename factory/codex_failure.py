"""Recognize subscription failures without exposing the CLI's potentially private output."""
import re


def stop_on_codex_failure(returncode, output):
    if not returncode:
        return
    if re.search(r'usage limit', output, re.I):
        raise SystemExit('Codex usage limit: subscription requires attention.')
    if re.search(r'\b401\b|not (?:logged|signed) in|unauthorized', output, re.I):
        raise SystemExit('Codex sign-out: subscription login requires attention.')
