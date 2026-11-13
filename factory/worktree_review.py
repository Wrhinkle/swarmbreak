#!/usr/bin/env python3
"""Summarize a capacity_inventory --filesystem JSON report using local merge history.

Usage: python3 factory/worktree_review.py INVENTORY.json > REVIEW.json
This is evidence for a human, not an eligibility check or a cleanup command.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

MERGE = re.compile(r'^Merge pull request #(\d+) from [^/\s]+/(\S+)$')
ISSUE_BRANCH = re.compile(r'^fix/issue-(\d+)$')
PR = re.compile(r'^swarmbreak-pr-(\d+)$')
ISSUE = re.compile(r'^swarmbreak-issue-(\d+)(-dry)?$')


def review(inventory, merge_subjects, active_path=None):
    prs, issues = set(), {}
    for line in merge_subjects.splitlines():
        match = MERGE.fullmatch(line)
        if match:
            pr, branch = match.groups()
            prs.add(pr)
            issue = ISSUE_BRANCH.fullmatch(branch)
            if issue:
                issues.setdefault(issue.group(1), []).append(pr)
    items = []
    for tree in inventory['worktrees']:
        name = Path(tree['path']).name
        pr, issue = PR.fullmatch(name), ISSUE.fullmatch(name)
        association = 'unknown; verify current job and remote state'
        if pr and pr.group(1) in prs:
            association = f'path named for locally recorded merged PR #{pr.group(1)}'
        elif issue and issue.group(1) in issues:
            numbers = ', #'.join(issues[issue.group(1)])
            if issue.group(2):
                association = (f'issue name matches branch in locally recorded merge for PR #{numbers}; '
                               'dry-run worktree is detached; match does not establish its contents or current status')
            else:
                association = f'branch named in locally recorded merge for PR #{numbers}'
        entries = tree.get('status_entries')
        if not tree.get('complete') or entries is None:
            state = 'uncertain'
        elif any(not e.startswith(('?? ', '!! ')) for e in entries):
            state = 'tracked changes'
        elif any(e.startswith('?? ') for e in entries):
            state = 'untracked'
        elif any(e.startswith('!! ') for e in entries):
            state = 'ignored'
        else:
            state = 'clean'
        items.append({'path': tree['path'], 'worktree_record': tree.get('worktree_record', []),
                      'allocated_kib_estimate': tree.get('allocated_kib_estimate'),
                      'state': state, 'status_entries': entries,
                      'retention_reasons': tree.get('retention_reasons', []),
                      'scan_errors': tree.get('scan_errors', tree.get('error')),
                      'activity': 'current checkout at report generation' if tree['path'] == active_path else 'unknown',
                      'association': association, 'action': 'retain; manual review required'})
    return {'scope': inventory['path'] if 'path' in inventory else None,
            'basis': 'Local merge subjects and one point-in-time scan; neither proves current issue or PR state, inactivity, or preservation of logs.',
            'approach': 'Retain all trees. Before any later cleanup, independently verify current issue/PR and process state, inspect all tracked, untracked and ignored files and native logs, preserve work and commits, and recheck immediately. Coordinate implementation with #104; this report authorizes no removal.',
            'worktrees': items}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding='utf-8') as source:
        inventory = json.load(source)
    history = subprocess.run(['git', 'log', '--merges', '--format=%s', 'HEAD'],
                             cwd=Path(__file__).resolve().parent.parent, check=True,
                             stdout=subprocess.PIPE, text=True).stdout
    print(json.dumps(review(inventory, history, str(Path(__file__).resolve().parent.parent)), indent=2))


if __name__ == '__main__':
    main()
