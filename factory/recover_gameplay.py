#!/usr/bin/env python3
"""Restore a complete legacy retry set supplied by the host.

Usage: python3 factory/recover_gameplay.py RUN_DIR MATCHING_SET ARCHIVE_DIR
The archive destination must not exist. No gameplay, balance, art or release is run here.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

NAMES = ('content.json', 'assembly-tried.json', 'balance-tried.json', 'balance-tried-provenance.json')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(directory):
    # Reject links and special files: an archive must be a complete, independent copy.
    result = {}
    for path in directory.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError(f'Unsupported archive entry: {path}')
        result[str(path.relative_to(directory))] = ('file', digest(path)) if path.is_file() else ('dir',)
    return result


def verify_set(directory):
    hashes = json.loads((directory / NAMES[3]).read_text())
    if hashes != {name: digest(directory / name) for name in NAMES[:3]}:
        raise ValueError('Retry provenance does not match the complete set')
    plan = json.loads((directory / NAMES[1]).read_text())
    for act in plan['acts']:
        for band in ('early', 'mid', 'late'):
            act['packs'][band]
        for elite in act['elites']:
            elite['id'], elite['reward']
        act['shop']
    if not plan['acts'] or not (directory / NAMES[2]).read_text():
        raise ValueError('Retry plan or report is empty')
    json.loads((directory / NAMES[0]).read_text())


def recover(active, source, archive):
    active, source, archive = (Path(p).resolve() for p in (active, source, archive))
    if not active.is_dir() or not source.is_dir() or archive.exists():
        raise ValueError('Active and matching set must exist; archive must be new')
    if active == source or active in source.parents or active in archive.parents or source in archive.parents or archive in active.parents or archive in source.parents:
        raise ValueError('Active, matching set and archive must be separate')
    if any((active / name).exists() for name in ('balance-history.json', 'balance-pending.json')):
        raise ValueError('History or pending evidence requires separate recovery')
    verify_set(source)
    # Only restore the content belonging to the active failed attempt. This
    # cannot substitute a different plan or erase the guard's retry history.
    if any(not (active / name).is_file() or digest(active / name) != digest(source / name) for name in NAMES[1:]):
        raise ValueError('Matching set is not the active failed plan, report and provenance')
    if all((active / name).is_file() and digest(active / name) == digest(source / name) for name in NAMES):
        raise ValueError('Matching retry set is already active')
    before = snapshot(active)
    shutil.copytree(active, archive)
    if snapshot(archive) != before or snapshot(active) != before:
        raise ValueError('Archive verification failed; active files were not changed')
    # Copy from the verified archive-independent set through a staging directory.
    # A partial interruption leaves mismatched evidence, which the gameplay guard rejects.
    staged = archive.parent / (archive.name + '.matching')
    if staged.exists():
        raise ValueError('Matching-set staging path already exists')
    staged.mkdir()
    for name in NAMES:
        shutil.copy2(source / name, staged / name)
    verify_set(staged)
    for name in NAMES:
        shutil.copy2(staged / name, active / name)
    verify_set(active)
    print(f'Archived and verified {archive}; restored and verified retry provenance in {active}')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4:
            sys.exit(__doc__)
        recover(*sys.argv[1:])
    except (OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(f'Recovery stopped: {error}')
