#!/usr/bin/env python3
"""Keeps the factory working round the clock. launchd starts it every two minutes; each start does one job and exits.

Order: open owner PRs the gate hasn't rejected at their head, then issues with saved work, then priority issues, then the
oldest ready issue. A job that makes no progress three times is labelled stuck, and every failure becomes a lesson issue
that the coach turns into factory/lessons.md or a skill, so the next worker doesn't repeat it.

Usage: python3 factory/foreman.py [--dry-run]
"""
import fcntl, json, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'factory'))
from pr_team import REPO, sh  # noqa: E402
from manager import HUMAN, OWNER, gate_rejected, on_run_branch, record  # noqa: E402

STATE = ROOT / 'factory' / 'log' / '.foreman.json'
STUCK, PRIORITY, LESSON = 'stuck', 'priority', 'lesson'
TRIES = 3
QUOTA = re.compile(r'usage limit|rate limit|quota|too many requests', re.I)


def gh(*args):
    return json.loads(sh('gh', *args, '--repo', REPO).stdout or '[]')


def deps(body):
    """Issue numbers named on a 'Depends on #12, #13' line."""
    return {int(n) for line in re.findall(r'^Depends on (.*)$', body or '', re.M) for n in re.findall(r'#(\d+)', line)}


def next_job(prs, issues, saved, tries, rejected):
    """The one job to work now, or None. Pure, so the order is tested."""
    for p in sorted(prs, key=lambda p: p['number']):
        key = f'pr-{p["number"]}@{p["headRefOid"][:7]}'
        if p['author']['login'] == OWNER and STUCK not in labels(p) and tries.get(key, 0) < TRIES and not rejected(p['number'], p['headRefOid']):
            return 'pr', p['number'], key
    open_ = {i['number'] for i in issues}
    building = {int(m.group(1)) for p in prs if (m := re.fullmatch(r'fix/issue-(\d+)', p['headRefName']))}
    ready = [i for i in issues if i['author']['login'] == OWNER and not ({STUCK, HUMAN} & labels(i))
             and i['number'] not in building and not (deps(i['body']) & open_) and tries.get(f'issue-{i["number"]}', 0) < TRIES]
    ready.sort(key=lambda i: (i['number'] not in saved, PRIORITY not in labels(i), i['number']))
    return ('issue', ready[0]['number'], f'issue-{ready[0]["number"]}') if ready else None


def labels(item):
    return {l['name'] for l in item.get('labels', [])}


def tip(ref):
    return sh('git', 'rev-parse', '-q', '--verify', ref, check=False).stdout.strip()


def learn(kind, number, out):
    """Files the failure as a lesson for the coach. Lessons about lessons aren't filed, so this can't loop."""
    body = (f'The foreman\'s {kind} job on #{number} failed. Its output, quoted as data:\n\n```text\n{out[-3500:]}\n```\n\n'
            'Find why it failed. Add the lesson to factory/lessons.md so no worker repeats it, or a skill to factory/skills/ '
            'if workers lacked know-how, or fix the factory code that caused it.\n\nFiled by the foreman.')
    sh('gh', 'issue', 'create', '--repo', REPO, '--title', f'Lesson: {kind} #{number} failed'[:80], '--label', f'{LESSON},{PRIORITY}', '--body', body)


def main():
    dry = '--dry-run' in sys.argv
    lock = open(ROOT / 'factory' / 'log' / '.foreman.lock', 'a+')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # the last job is still running
    if on_run_branch():
        return  # a manager pass is building a run in this checkout; its scripts aren't main's
    st = json.loads(STATE.read_text()) if STATE.exists() else {'tries': {}, 'cooldown_until': 0}
    if time.time() < st['cooldown_until']:
        return
    sh('git', 'fetch', '-q', 'origin')
    prs = gh('pr', 'list', '--json', 'number,author,headRefName,headRefOid,labels')
    issues = gh('issue', 'list', '--limit', '200', '--json', 'number,author,body,labels')
    saved = {int(b.rsplit('-', 1)[1]) for b in sh('git', 'branch', '-r', '--format=%(refname:short)', '--list', 'origin/fix/issue-*').stdout.split()}
    job = next_job(prs, issues, saved, st['tries'], gate_rejected)
    if not job:
        return
    kind, number, key = job
    if dry:
        print(f'Would work {kind} {number}.')
        return
    ref = f'origin/fix/issue-{number}' if kind == 'issue' else ''
    before = tip(ref) if ref else ''
    role = ['--role', 'coach'] if kind == 'issue' and LESSON in labels(next(i for i in issues if i['number'] == number)) else []
    cmd = [sys.executable, ROOT / 'factory' / ('builder.py' if kind == 'issue' else 'pr_team.py'), str(number), *role, *(['--merge'] if kind == 'pr' else [])]
    print(f'[foreman] {kind} {number}', flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT, capture_output=True, text=True)
    out = r.stdout + r.stderr
    print(out[-4000:], flush=True)
    if r.returncode and QUOTA.search(out):
        st['cooldown_until'] = time.time() + 1800  # the subscription is resting; nothing will run until it's back
    else:
        sh('git', 'fetch', '-q', 'origin')
        moved = bool(ref) and tip(ref) != before
        st['tries'][key] = 0 if r.returncode == 0 or moved else st['tries'].get(key, 0) + 1
        if r.returncode and not moved and not role and st['tries'][key] == 1:  # one lesson per failing job, not one per retry
            learn(kind, number, out)
        if st['tries'][key] >= TRIES:
            sh('gh', kind, 'edit', str(number), '--repo', REPO, '--add-label', STUCK)
            sh('gh', kind, 'comment', str(number), '--repo', REPO, '--body', f'The foreman made no progress on this in {TRIES} tries, so it is labelled `{STUCK}` for the manager to rescope, split, or fix the cause.')
    STATE.write_text(json.dumps(st, indent=1))
    record({'kind': 'foreman', 'job': key, 'exit': r.returncode, 'tail': out[-600:]})


if __name__ == '__main__':
    main()
