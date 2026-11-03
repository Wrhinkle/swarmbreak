#!/usr/bin/env python3
"""Works one PR through Qodo: triage bot judges each finding, fixer bot fixes the real ones, Qodo reviews the fixes.

Usage: python3 factory/pr_team.py <pr-number> [--merge]
This script does all git and Qodo writes, and alone decides on merging. Merging also needs --merge.
"""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / 'factory' / 'agents'
QODO = str(Path.home() / '.qodo/bin/qodo')
REPO = 'Wrhinkle/swarmbreak'
ROUNDS, QODO_WAIT = 2, 1500
OPEN = {'pending', 'partial_implementation', 'not_implemented', 'focus_areas_edited'}
PROTECTED = ('AGENTS.md', 'factory/', 'firebase.json', 'public/manifest.json', '.github/')


def sh(*cmd, cwd=ROOT, check=True):
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if check and r.returncode:
        sys.exit(f'{" ".join(map(str, cmd))[:200]} failed:\n{(r.stdout + r.stderr)[-1500:]}')
    return r


def bot(name, workdir, extra, effort='medium'):
    env = {k: v for k, v in os.environ.items() if not k.endswith(('_API_KEY', '_AUTH_TOKEN', '_BASE_URL'))}
    prompt = (AGENTS / f'{name}.md').read_text() + '\n\n' + extra
    print(f'[{name}] running', flush=True)
    subprocess.run(['codex', 'exec', '-m', 'gpt-6.1-terra', '-c', f'model_reasoning_effort="{effort}"', '-s', 'workspace-write', '--skip-git-repo-check', '-C', str(workdir), prompt], stdin=subprocess.DEVNULL, capture_output=True, text=True, env=env, timeout=1800)


def findings(url):
    return json.loads(sh(QODO, 'pr-review-session', 'findings', '--pr-url', url, '--json').stdout)


def is_open(f):
    return f.get('attribution_status') in OPEN


def verified(tree):
    for cmd in (['npm', 'run', 'build'], ['npm', 'test']):
        r = sh(*cmd, cwd=tree, check=False)
        if r.returncode:
            return (r.stdout + r.stderr)[-2000:]
    return ''


def wait_for_review(url, sha):
    deadline = time.time() + QODO_WAIT
    while time.time() < deadline:
        s = findings(url).get('review_session') or {}
        if s.get('commit_sha') == sha and s.get('review_complete'):
            return
        if s.get('commit_sha') == sha and s.get('status') == 'failed':
            sys.exit(f'Qodo\'s review of {sha[:7]} failed. A PR of tens of thousands of lines can do this, so split it. Not merging.')
        if s.get('commit_sha') == sha and s.get('status') == 'skipped':
            sys.exit(f'Qodo skipped {sha[:7]}, so it has no review. Not merging.')
        time.sleep(30)
    sys.exit(f'Qodo hasn\'t reviewed {sha[:7]} after {QODO_WAIT // 60} minutes. Not merging.')


def main():
    number, merge = sys.argv[1], '--merge' in sys.argv
    pr = json.loads(sh('gh', 'pr', 'view', number, '--repo', REPO, '--json', 'url,headRefName,baseRefName,state,headRefOid').stdout)
    if pr['state'] != 'OPEN':
        sys.exit(f'PR {number} is {pr["state"]}.')
    url, head, base = pr['url'], pr['headRefName'], pr['baseRefName']
    tree = ROOT.parent / f'swarmbreak-pr-{number}'
    sh('git', 'fetch', '-q', 'origin')
    if not tree.exists():
        sh('git', 'worktree', 'add', '-q', '--detach', tree, f'origin/{head}')
    sh('git', 'checkout', '-q', '--detach', f'origin/{head}', cwd=tree)
    if sh('git', 'status', '--porcelain', cwd=tree).stdout.strip():
        sys.exit(f'{tree} has uncommitted work. Stopping so it isn\'t lost.')
    if not (tree / 'node_modules').exists():
        sh('npm', 'ci', '--silent', cwd=tree)
    # Check against the newest base, so a merge can't overwrite newer work.
    if sh('git', 'merge', '-q', '--no-edit', f'origin/{base}', cwd=tree, check=False).returncode:
        sh('git', 'merge', '--abort', cwd=tree, check=False)
        sys.exit(f'{head} conflicts with {base}. A person needs to reconcile it.')
    # Qodo only reviews pushed commits and skips merges, so a caught-up branch needs a plain commit on top.
    if sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip() != pr['headRefOid']:
        sh('git', 'commit', '-q', '--allow-empty', '-m', f'Ask Qodo to review after catching up with {base}', cwd=tree)
        sh('git', 'push', '-q', 'origin', f'HEAD:{head}', cwd=tree)

    # An unfinished review lists no findings yet, which isn't the same as a clean one.
    wait_for_review(url, sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip())
    for round_no in range(ROUNDS + 1):
        data = findings(url)
        session = data.get('review_session') or {}
        current = sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip()
        todo = [f for f in data['findings'] if is_open(f)]
        print(f'Round {round_no + 1}: Qodo reviewed {str(session.get("commit_sha"))[:7]}, {len(todo)} open findings', flush=True)
        if not todo or round_no == ROUNDS:
            break
        with tempfile.TemporaryDirectory() as work:
            (Path(work) / 'findings.json').write_text(json.dumps(todo, indent=1))
            bot('pr-triage', work, f'The repo is at {tree}. Don\'t change it. Write decisions.json in the current folder.', effort='high')
            out = Path(work) / 'decisions.json'
            if not out.exists():
                sys.exit('Triage wrote no decisions.')
            decisions = {d['id']: d for d in json.loads(out.read_text())['decisions']}
        if sh('git', 'status', '--porcelain', cwd=tree).stdout.strip():
            sys.exit('Triage changed the repo, which it must not do. Stopping.')
        missing = [f['id'] for f in todo if f['id'] not in decisions]
        if missing:
            sys.exit(f'Triage skipped findings: {missing}')
        fixes, dismissals = [], []
        for f in todo:
            d = decisions[f['id']]
            if d['action'] == 'dismiss' and d.get('evidence') and d.get('reason') in ('false_positive', 'intentional', 'deferred', 'rejected') and not (d['reason'] == 'deferred' and f.get('action_level') == 'action_required'):
                dismissals.append((f, d))
            else:
                fixes.append({**f, 'plan': d.get('plan', 'Fix the defect described.')})
        print(f'Triage: {len(fixes)} to fix, {len(dismissals)} to dismiss', flush=True)

        if fixes:
            problems = ''
            (tree / '.git-fixes.json').write_text(json.dumps(fixes, indent=1))
            for attempt in range(2):
                bot('pr-fixer', tree, f'The findings are in .git-fixes.json (not part of the repo; leave it). {problems}', effort='high')
                changed = [l[3:] for l in sh('git', 'status', '--porcelain', cwd=tree).stdout.splitlines() if not l.endswith('.git-fixes.json')]
                touched = [c for c in changed if c.startswith(PROTECTED)]
                problems = f'Don\'t edit these: {touched}. ' if touched else ''
                if touched:
                    sh('git', 'checkout', '--', *touched, cwd=tree)
                failed = verified(tree)
                if failed:
                    problems += f'Build or tests fail:\n{failed}'
                if not problems:
                    break
            (tree / '.git-fixes.json').unlink()
            if problems:
                sys.exit(f'Fixer didn\'t get to green, so nothing was pushed. The attempt is in {tree}.\n{problems[:1500]}')
            sh('git', 'add', '-A', cwd=tree)
            if sh('git', 'diff', '--cached', '--quiet', cwd=tree, check=False).returncode == 0:
                sys.exit(f'The fixer changed nothing, and these findings are still open: {[f["title"] for f in fixes]}. Not merging.')
            titles = '\n'.join(f'- {f["title"]}' for f in fixes)
            attribution = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
            sh('git', 'commit', '-q', '-m', f'Fix Qodo findings on PR #{number}\n\n{titles}\n\n{attribution}', cwd=tree)
            # Qodo checks the fixes before anything leaves this Mac.
            r = sh(QODO, 'review', '--base', f'origin/{head}', '--json', cwd=tree, check=False)
            try:
                local = json.loads(r.stdout)
            except json.JSONDecodeError:
                sys.exit(f'Qodo local review gave no result, so nothing was pushed:\n{(r.stdout + r.stderr)[-800:]}')
            blockers = [f for f in local.get('findings', []) if f.get('action_level') == 'action_required']
            print(f'Qodo local review: {len(local.get("findings", []))} findings, {len(blockers)} blocking', flush=True)
            if blockers:
                sys.exit('Qodo blocks the fixes, so nothing was pushed:\n' + '\n'.join(f'- {b.get("title")}' for b in blockers))

        # Push first: a finding is only marked done once its fix has landed.
        sh('git', 'fetch', '-q', 'origin')
        if sh('git', 'merge-base', '--is-ancestor', f'origin/{head}', 'HEAD', cwd=tree, check=False).returncode:
            sys.exit(f'{head} moved while this ran. Stopping without a push.')
        sh('git', 'push', '-q', 'origin', f'HEAD:refs/heads/{head}', cwd=tree)
        if fixes:
            ids = ','.join(f['id'] for f in fixes)
            sh(QODO, 'pr-review-session', 'mark-implemented', '--finding-ids', ids, '--explanation', f'Fixed in {sh("git", "rev-parse", "--short", "HEAD", cwd=tree).stdout.strip()}, tests pass, Qodo local review has no blocking findings.')
        for f, d in dismissals:
            sh(QODO, 'pr-review-session', 'dismiss', '--finding-ids', f['id'], '--reason', d['reason'], '--explanation', d['evidence'][:1900])
            print(f'Dismissed ({d["reason"]}): {f["title"]}: {d["evidence"][:200]}', flush=True)

        pushed = sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip()
        if pushed == current:
            continue
        print(f'Pushed {pushed[:7]}. Waiting for Qodo to review it', flush=True)
        wait_for_review(url, pushed)

    # The merge decision. Only evidence tied to the exact head commit counts.
    sh('git', 'fetch', '-q', 'origin')
    data, sha = findings(url), sh('git', 'rev-parse', f'origin/{head}').stdout.strip()
    session = data.get('review_session') or {}
    still = [f for f in data['findings'] if is_open(f)]
    sh('git', 'checkout', '-q', '--detach', sha, cwd=tree)
    blocks = []
    if session.get('commit_sha') != sha or not session.get('review_complete'):
        blocks.append(f'Qodo has no finished review of {sha[:7]} (last: {str(session.get("commit_sha"))[:7]}, {session.get("status")})')
    if still:
        blocks.append(f'{len(still)} open findings: ' + '; '.join(f['title'] for f in still))
    if sh('git', 'merge-base', '--is-ancestor', f'origin/{base}', sha, check=False).returncode:
        blocks.append(f'{head} is behind {base}')
    failed = verified(tree)
    if failed:
        blocks.append(f'Build or tests fail: {failed[-500:]}')
    if blocks:
        sys.exit('Not ready to merge:\n- ' + '\n- '.join(blocks))
    if not merge:
        print(f'PR {number} passes every check at {sha[:7]}. Run with --merge to merge it.')
        return
    sh('gh', 'pr', 'merge', number, '--repo', REPO, '--merge', '--match-head-commit', sha)
    print(f'Merged PR {number} at {sha[:7]}.')


if __name__ == '__main__':
    main()
