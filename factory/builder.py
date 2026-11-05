#!/usr/bin/env python3
"""Turns one reported issue into a PR: a Terra bot fixes code or content in its own checkout, and this script holds the limits.

Usage: python3 factory/builder.py <issue> [--dry-run]
Prints the PR number on the last line when it opens one. Only issues filed by the repo owner qualify for now.
"""
import json, re, shutil, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'factory'))
from pr_team import PROTECTED, REPO, bot, sh, verified  # noqa: E402

OWNER, SITE = 'Wrhinkle', 'https://swarmbreak-game.web.app'
LOCKED = (*PROTECTED, '.gitignore', 'vite.config')
RESULT = '.builder-result.json'
RETRIES = 2
TEXT_KEYS = {'name', 'blurb', 'title', 'theme', 'intro', 'outro', 'bossIntro', 'text', 'label', 'result'}


def blocked_paths(changed, live):
    """Paths this bot can't change: the limits themselves, and the stored stages of a run players are on."""
    return [c for c in changed if c.startswith(LOCKED) or c.startswith(f'runs/{live}/')]


def criteria(body):
    """The issue's acceptance-criteria section, so Qodo reviews the change against the request."""
    m = re.search(r'^#+\s*acceptance criteria\s*$(.*?)(?=^#+\s|\Z)', body or '', re.I | re.M | re.S)
    return (m.group(1).strip() if m else '') or f'The issue has no acceptance-criteria section. Its request:\n> ' + (body or '').strip()[:1500].replace('\n', '\n> ')


def only_wording(old, new, key=None):
    """True when two versions of a run differ in display text alone, so a fix can't change the day's game."""
    if type(old) is not type(new):
        return False
    if isinstance(old, dict):
        return old.keys() == new.keys() and all(only_wording(old[k], new[k], k) for k in old)
    if isinstance(old, list):
        return len(old) == len(new) and all(only_wording(a, b, key) for a, b in zip(old, new))
    return old == new or (isinstance(old, str) and key in TEXT_KEYS)


def touched_run(changed, tree):
    """Run ids whose stored content changed and need rebuilding."""
    return sorted({m.group(1) for c in changed if (m := re.match(r'runs/(\d{4}-\d{2}-\d{2})/(content|assembly)\.json$', c))})


def problems_in(tree, live):
    changed = [l[3:].strip('"') for l in sh('git', 'status', '--porcelain', '-uall', cwd=tree).stdout.splitlines() if not l.endswith(RESULT)]
    bad = [f"You can't edit: {p}" for p in blocked_paths(changed, live)]
    live_file = f'public/runs/{live}/run.json'
    if live_file in changed:
        before = sh('git', 'show', f'HEAD:{live_file}', cwd=tree).stdout
        if not only_wording(json.loads(before), json.loads((tree / live_file).read_text())):
            bad.append(f'{live_file} is live, so only wording can change')
    for path in changed:
        if re.match(rf'public/runs/(?!{live}/)', path) and path.endswith('run.json'):
            bad.append(f"Edit runs/<id>/content.json rather than {path}; the host rebuilds it")
    if bad:
        return bad, changed
    for run_id in touched_run(changed, tree):
        d, vite = f'runs/{run_id}', ['npx', 'vite-node']
        sites = f'{d}/sites.json'
        steps = [[*vite, 'tools/checks.ts', 'content', f'{d}/content.json', sites],
                 [*vite, 'tools/checks.ts', 'assembly', f'{d}/assembly.json', f'{d}/content.json'],
                 [*vite, 'tools/build-run.ts', d],
                 [*vite, 'tools/balance.ts', f'public/runs/{run_id}/run.json', '--tune', '--report', f'{d}/balance.json']]
        for step in steps:
            r = sh(*step, cwd=tree, check=False)
            if r.returncode:
                bad.append(f'{" ".join(step[2:4])} failed:\n{(r.stdout + r.stderr)[-1200:]}')
                break
    failed = verified(tree)
    if failed:
        bad.append(f'Build or tests fail:\n{failed}')
    return bad, changed


def main():
    number, dry = sys.argv[1], '--dry-run' in sys.argv
    role = sys.argv[sys.argv.index('--role') + 1] if '--role' in sys.argv else ''
    issue = json.loads(sh('gh', 'issue', 'view', number, '--repo', REPO, '--json', 'number,title,body,author,state').stdout)
    if issue['author']['login'] != OWNER or issue['state'] != 'OPEN':
        sys.exit(f'Issue {number} is {issue["state"]} from {issue["author"]["login"]}. Only open issues from {OWNER} qualify.')
    branch = f'fix/issue-{number}'
    if sh('gh', 'pr', 'list', '--repo', REPO, '--head', branch, '--json', 'number', '--jq', 'length').stdout.strip() != '0':
        sys.exit(f'{branch} already has an open PR.')
    with urllib.request.urlopen(f'{SITE}/manifest.json', timeout=20) as r:
        live = json.load(r)['runId']
    tree = ROOT.parent / f'swarmbreak-issue-{number}'
    sh('git', 'fetch', '-q', 'origin')
    if tree.exists():
        sh('git', 'worktree', 'remove', '--force', tree)
    sh('git', 'worktree', 'add', '-q', '-B', branch, tree, 'origin/main')
    sh('npm', 'ci', '--silent', cwd=tree)
    (tree / '.issue.json').write_text(json.dumps({'title': issue['title'], 'body': issue['body'], 'live_run': live}, indent=1))

    extra, result, bad = '', {}, []
    for attempt in range(RETRIES + 1):
        (tree / RESULT).unlink(missing_ok=True)
        brief = (ROOT / 'factory/agents' / f'{role}.md').read_text() + '\n\nDo the job above under the builder rules.\n\n' if role else ''
        bot('builder', tree, f'{brief}The report is in .issue.json. {extra}', effort='high')
        try:
            result = json.loads((tree / RESULT).read_text())
        except (OSError, json.JSONDecodeError) as e:
            bad, changed = [f'{RESULT} unreadable: {e}'], []
        else:
            if result.get('outcome') != 'fixed':
                break
            bad, changed = problems_in(tree, live)
            bad += [] if changed else ['outcome is fixed, but nothing changed']
        if not bad:
            break
        print(f'[builder] attempt {attempt + 1} refused: {bad}', flush=True)
        extra = 'Your last attempt was refused. Fix each of these:\n' + '\n'.join(bad)
    (tree / '.issue.json').unlink()
    outcome = result.get('outcome')
    if outcome != 'fixed':
        sh('git', 'checkout', '-q', '--', '.', cwd=tree)
        print(f'{outcome}: {result.get("summary")} Evidence: {result.get("evidence")}')
        if outcome == 'not_reproduced':
            if not dry:
                sh('gh', 'issue', 'close', number, '--repo', REPO, '--comment', f'The factory builder could not reproduce this on main.\n\n{result.get("summary")}\n\nEvidence: {result.get("evidence")}')
            return
        sys.exit(f'Builder stopped with outcome {outcome}, so issue {number} is still open.')
    if bad:
        sys.exit(f'Builder never got to green, so nothing was pushed. The attempt is in {tree}.\n{str(bad)[:1500]}')
    (tree / RESULT).unlink()
    if dry:
        print(f'Would open a PR for: {result.get("summary")}\nThe attempt is in {tree}.')
        return
    sh('git', 'add', '-A', cwd=tree)
    title = f'Fix issue {number}: {issue["title"]}'[:90]
    sh('git', 'commit', '-q', '-m', f'{title}\n\n{result["summary"]}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', cwd=tree)
    sh('git', 'push', '-q', '--force-with-lease', 'origin', branch, cwd=tree)
    url = sh('gh', 'pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch, '--title', title, '--body', f'Fixes #{number}: https://github.com/{REPO}/issues/{number}\n\n## Acceptance criteria (from the issue)\n{criteria(issue["body"])}\n\n## Change\n{result["summary"]}\n\nEvidence: {result["evidence"]}\n\nWritten by the factory builder on GPT-6.1 Terra.').stdout.strip()
    print(url)
    print(url.rsplit('/', 1)[1])


if __name__ == '__main__':
    main()
