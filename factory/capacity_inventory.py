#!/usr/bin/env python3
"""Read-only capacity evidence for a registered worktree; never authorizes removal.

Usage: python3 factory/capacity_inventory.py WORKTREE
       python3 factory/capacity_inventory.py --filesystem PATH
Run from the factory checkout. All results retain worktrees pending eligibility checks.
Filesystem mode emits JSON progress lines to stderr and the complete report to stdout.
Each status and disk-usage scan has a five-second timeout.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_TIMEOUT_SECONDS = 5


def command(*args, timeout=None):
    return subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=timeout)


def worktree_records():
    return command('git', 'worktree', 'list', '--porcelain', '-z').stdout.split(b'\0\0')


def inventory(path, record=None):
    path = Path(path).resolve(strict=True)
    if record is None:
        record = next((r.split(b'\0') for r in worktree_records() if r.startswith(b'worktree ') and
                       os.fsdecode(r.split(b'\0', 1)[0][9:]) == str(path)), None)
        if record is None:
            raise ValueError('path is not a registered worktree')
    usage = shutil.disk_usage(path)
    result = {'path': str(path), 'device': os.stat(path).st_dev,
              'free_bytes': usage.free, 'total_bytes': usage.total,
              'allocated_kib_estimate': None, 'status_entries': None,
              'worktree_record': [os.fsdecode(field) for field in record if field],
              'removal_eligibility': 'unknown: ownership, activity, job state and saved work not verified; retain'}
    errors = {}
    try:
        status = command('git', '--no-optional-locks', '-C', str(path), 'status', '--porcelain=v1', '-z',
                         '--untracked-files=all', '--ignored=matching', timeout=SCAN_TIMEOUT_SECONDS).stdout
        result['status_entries'] = [os.fsdecode(entry) for entry in status.split(b'\0') if entry]
    except (OSError, subprocess.SubprocessError) as error:
        errors['status'] = str(error)
    try:
        # du counts allocated blocks, stays on this filesystem, and does not follow symlinks.
        size = command('du', '-skx', str(path), timeout=SCAN_TIMEOUT_SECONDS).stdout.split(b'\t', 1)[0].strip()
        result['allocated_kib_estimate'] = int(size)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        errors['disk_usage'] = str(error)
    result['complete'] = not errors
    if errors:
        result['scan_errors'] = errors
    return result


def filesystem_inventory(path, progress=None):
    """Report registered worktrees on a device, including uninspectable records."""
    path = Path(path).resolve(strict=True)
    device = os.stat(path).st_dev
    usage = shutil.disk_usage(path)
    result = {'path': str(path), 'device': device, 'free_bytes': usage.free,
              'total_bytes': usage.total, 'worktrees': []}
    if progress:
        progress({'type': 'filesystem', **{k: v for k, v in result.items() if k != 'worktrees'}})
    for record in worktree_records():
        fields = record.split(b'\0')
        if not fields[0].startswith(b'worktree '):
            continue
        tree = os.fsdecode(fields[0][9:])
        try:
            if os.stat(tree).st_dev != device:
                continue
            item = inventory(tree, fields)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            # An inaccessible tree may be on the target filesystem; never silently omit it.
            item = {'path': tree, 'worktree_record': [os.fsdecode(f) for f in fields if f],
                    'error': str(error), 'complete': False, 'removal_eligibility': 'unknown: retain'}
        result['worktrees'].append(item)
        if progress:
            progress({'type': 'worktree', **item})
    return result


def main():
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[1] != '--filesystem'):
        sys.exit(__doc__)
    progress_available = True

    def progress(item):
        nonlocal progress_available
        if progress_available:
            try:
                print(json.dumps(item), file=sys.stderr, flush=True)
            except OSError:
                progress_available = False

    try:
        result = filesystem_inventory(
            sys.argv[2], progress
        ) if len(sys.argv) == 3 else inventory(sys.argv[1])
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f'Inventory incomplete; retain worktree: {error}')


if __name__ == '__main__':
    main()
