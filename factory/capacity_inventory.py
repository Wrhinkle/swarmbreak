#!/usr/bin/env python3
"""Read-only capacity evidence for a registered worktree; never authorizes removal.

Usage: python3 factory/capacity_inventory.py WORKTREE
Run from the factory checkout. Inspect each suspected worktree separately.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def command(*args):
    return subprocess.run(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def inventory(path):
    path = Path(path).resolve(strict=True)
    records = command('git', 'worktree', 'list', '--porcelain', '-z').stdout.split(b'\0\0')
    record = next((r.split(b'\0') for r in records if r.startswith(b'worktree ') and
                   os.fsdecode(r.split(b'\0', 1)[0][9:]) == str(path)), None)
    if record is None:
        raise ValueError('path is not a registered worktree')
    usage = shutil.disk_usage(path)
    status = command('git', '-C', str(path), 'status', '--porcelain=v1', '-z',
                     '--untracked-files=all', '--ignored=matching').stdout
    # du counts allocated blocks, stays on this filesystem, and does not follow symlinks.
    size = command('du', '-skx', str(path)).stdout.split(b'\t', 1)[0].strip()
    return {'path': str(path), 'device': os.stat(path).st_dev,
            'free_bytes': usage.free, 'total_bytes': usage.total,
            'allocated_kib_estimate': int(size),
            'worktree_record': [os.fsdecode(field) for field in record if field],
            'status_entries': [os.fsdecode(entry) for entry in status.split(b'\0') if entry],
            'removal_eligibility': 'unknown: ownership, activity, job state and saved work not verified; retain'}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    try:
        print(json.dumps(inventory(sys.argv[1]), indent=2))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f'Inventory incomplete; retain worktree: {error}')


if __name__ == '__main__':
    main()
