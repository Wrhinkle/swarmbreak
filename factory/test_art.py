#!/usr/bin/env python3
"""Subscription failures stop queued image work and retries."""
import json
import sys
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import art

with tempfile.TemporaryDirectory() as d:
    root = Path(d)
    run = root / 'runs' / 'day'
    run.mkdir(parents=True)
    for name in ('content.json', 'art-brief.json'):
        (run / name).write_text('{}')
    entered = threading.Barrier(4)
    calls = []
    def generate(job, work, stop):
        calls.append(job['id'])
        entered.wait(timeout=5)
        if job['id'] == '0':
            stop.set()
            raise SystemExit('Codex usage limit: subscription requires attention.')
        stop.event.wait(timeout=5)
        return None
    jobs = [dict(id=str(i)) for i in range(8)]
    with patch.object(art, 'ROOT', root), patch.object(sys, 'argv', ['art.py', 'day']), \
         patch.object(art, 'jobs', return_value=jobs), patch.object(art, 'generate', side_effect=generate):
        try:
            art.main()
            assert False, 'subscription error must propagate'
        except SystemExit as e:
            assert 'Codex usage limit' in str(e)
    assert sorted(calls) == ['0', '1', '2', '3'], calls

with tempfile.TemporaryDirectory() as d:
    work = Path(d)
    stop = art.ImageStop()
    def launch(*args, **kwargs):
        kwargs['stdout'].write('usage limit')
        return SimpleNamespace(returncode=1)
    with patch.object(stop, 'run', side_effect=launch) as run:
        try:
            art.generate({'id': 'first', 'prompt': 'x'}, work, stop)
            assert False
        except SystemExit as e:
            assert 'Codex usage limit' in str(e)
        assert stop.is_set()
        assert art.generate({'id': 'retry', 'prompt': 'x'}, work, stop) is None
        assert run.call_count == 1
print('ok image subscription stop')
