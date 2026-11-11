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

# A killed copy must never become the cache, and a later attempt can regenerate it.
with tempfile.TemporaryDirectory() as d:
    work = Path(d)
    stop = art.ImageStop()
    pending = work / '.creature.pending.png'
    calls = []
    def interrupted_then_complete(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            pending.write_bytes(b'\x89PNG\r\n\x1a\npartial')
            assert not (work / 'creature.png').exists()
            raise art.subprocess.TimeoutExpired('codex', 420)
        assert not pending.exists()
        art.Image.new('RGB', (2, 2)).save(pending)
        return SimpleNamespace(returncode=0)
    with patch.object(stop, 'run', side_effect=interrupted_then_complete):
        result = art.generate({'id': 'creature', 'prompt': 'x'}, work, stop)
    assert result == work / 'creature.png' and art.valid_png(result)
    assert len(calls) == 2 and not pending.exists()

# A corrupt cache is discarded and does not prevent a fresh generation.
with tempfile.TemporaryDirectory() as d:
    work = Path(d)
    cached = work / 'creature.png'
    cached.write_bytes(b'\x89PNG\r\n\x1a\npartial')
    def regenerate(*args, **kwargs):
        assert not cached.exists()
        art.Image.new('RGB', (2, 2)).save(work / '.creature.pending.png')
        return SimpleNamespace(returncode=0)
    with patch.object(art.ImageStop, 'run', side_effect=regenerate) as run:
        assert art.generate({'id': 'creature', 'prompt': 'x'}, work, art.ImageStop()) == cached
        assert run.call_count == 1 and art.valid_png(cached)

# Decode errors encountered while finishing use the same cleanup and retry as rejected art.
with tempfile.TemporaryDirectory() as d:
    root = Path(d)
    run_dir = root / 'runs' / 'day'
    run_dir.mkdir(parents=True)
    for name in ('content.json', 'art-brief.json'):
        (run_dir / name).write_text('{}')
    calls = []
    def generate_for_finish(job, work, stop):
        png = work / 'creature.png'
        assert not png.exists()
        png.write_bytes(b'generated')
        return png
    def finish_after_decode_error(*args):
        calls.append(1)
        if len(calls) == 1:
            raise OSError('truncated image')
        return ''
    with patch.object(art, 'ROOT', root), patch.object(sys, 'argv', ['art.py', 'day']), \
         patch.object(art, 'jobs', return_value=[{'id': 'creature'}]), \
         patch.object(art, 'generate', side_effect=generate_for_finish), \
         patch.object(art, 'finish', side_effect=finish_after_decode_error):
        try:
            art.main()
        except SystemExit as e:
            assert e.code == 0
    assert len(calls) == 2
print('ok image validation and retries')
