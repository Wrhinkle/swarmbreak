#!/usr/bin/env python3
"""Capture a committed camp state for human review, without changing any review gate.

Usage: python3 factory/capture_review.py FULL_COMMIT camp-empty|camp-populated NEW_OUTPUT_DIR
The commit must already be present locally. Inspect both images and capture.json; capture alone
never resolves a finding. Output directories are created once and never reused.
"""
import json
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from pr_team import ROOT, sandboxed, sandbox_works, screen_browser


def export_commit(commit, tree):
    resolved = subprocess.run(['git', 'rev-parse', '--verify', f'{commit}^{{commit}}'], cwd=ROOT,
                              capture_output=True, text=True, check=True).stdout.strip()
    if resolved != commit:
        raise ValueError('commit must be the full exact commit ID')
    archive = tree / 'source.tar'
    subprocess.run(['git', 'archive', '--format=tar', f'--output={archive}', commit], cwd=ROOT, check=True)
    with tarfile.open(archive) as source:
        source.extractall(tree, filter='data')
    archive.unlink()
    subprocess.run(['cp', '-cR', str(ROOT / 'node_modules'), str(tree / 'node_modules')], check=True)


def capture(commit, state, out):
    if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', commit) or state not in ('camp-empty', 'camp-populated'):
        raise ValueError('supply a full commit ID and a supported camp state')
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='review-capture-') as temp:
        tree, dist = Path(temp) / 'tree', Path(temp) / 'dist'
        tree.mkdir()
        export_commit(commit, tree)
        sandbox_works()
        exe = screen_browser()
        built = sandboxed(['npm', 'run', 'build'], tree, dist_to=dist)
        if built.returncode:
            raise RuntimeError('capture build failed: ' + (built.stdout + built.stderr)[-2000:])
        result = subprocess.run(['node', str(ROOT / 'factory' / 'screens.mjs'), exe, str(dist), str(out), state],
                                capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=300)
        if result.returncode:
            raise RuntimeError('capture failed: ' + result.stderr[-2000:])
        try:
            shots = json.loads(result.stdout)
            if {(s['screen'], s['width']) for s in shots} != {(state, 390), (state, 1280)} or len(shots) != 2:
                raise ValueError('requested screens missing')
            for shot in shots:
                if shot.get('errors') or not (out / f"{state}-{shot['width']}.png").is_file():
                    raise ValueError('screen has errors or no image')
        except (ValueError, KeyError, TypeError) as exc:
            raise RuntimeError(f'capture incomplete: {exc}') from exc
        (out / 'capture.json').write_text(json.dumps({'commit': commit, 'state': state, 'screens': shots}, indent=2) + '\n')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4:
            raise ValueError(__doc__)
        capture(*sys.argv[1:])
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        sys.exit(f'Capture unresolved: {exc}')
