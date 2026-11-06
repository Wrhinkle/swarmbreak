#!/usr/bin/env python3
"""Keeps the factory working round the clock. launchd starts it every two minutes; each start does one job and exits.

Order: open owner PRs the gate hasn't rejected at their head, then issues with saved work, then priority issues, then the
oldest ready issue. A job that fails without progress isn't retried: it becomes a lesson issue, and the job waits until
the coach closes that lesson by fixing the cause, adding to factory/lessons.md, or writing a skill. A lesson the coach
can't finish is labelled stuck, with its job, for the manager.

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
QUOTA = re.compile(r'usage limit|rate limit|quota|too many requests', re.I)


def gh(*args):
    return json.loads(sh('gh', *args, '--repo', REPO).stdout or '[]')


def deps(body):
    """Issue numbers named on a 'Depends on #12, #13' line."""
    return {int(n) for line in re.findall(r'^Depends on (.*)$', body or '', re.M) for n in re.findall(r'#(\d+)', line)}


def next_job(prs, issues, saved, held, rejected):
    """The one job to work now, or None. Pure, so the order is tested."""
    for p in sorted(prs, key=lambda p: p['number']):
        key = f'pr-{p["number"]}@{p["headRefOid"][:7]}'
        if p['author']['login'] == OWNER and STUCK not in labels(p) and key not in held and not rejected(p['number'], p['headRefOid']):
            return 'pr', p['number'], key
    open_ = {i['number'] for i in issues}
    building = {int(m.group(1)) for p in prs if (m := re.fullmatch(r'fix/issue-(\d+)', p['headRefName']))}
    ready = [i for i in issues if i['author']['login'] == OWNER and not ({STUCK, HUMAN} & labels(i))
             and i['number'] not in building and not (deps(i['body']) & open_) and f'issue-{i["number"]}' not in held]
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
    url = sh('gh', 'issue', 'create', '--repo', REPO, '--title', f'Lesson: {kind} #{number} failed'[:80], '--label', f'{LESSON},{PRIORITY}', '--body', body).stdout.strip()
    return int(url.rsplit('/', 1)[1])


def main():
    dry = '--dry-run' in sys.argv
    lock = open(ROOT / 'factory' / 'log' / '.foreman.lock', 'a+')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # the last job is still running
    if on_run_branch():
        return  # a manager pass is building a run in this checkout; its scripts aren't main's
    st = {'waiting': {}, 'cooldown_until': 0, **(json.loads(STATE.read_text()) if STATE.exists() else {})}
    if time.time() < st['cooldown_until']:
        return
    sh('git', 'fetch', '-q', 'origin')
    prs = gh('pr', 'list', '--limit', '500', '--json', 'number,author,headRefName,headRefOid,labels')
    issues = gh('issue', 'list', '--limit', '500', '--json', 'number,author,body,labels')
    saved = {int(b.rsplit('-', 1)[1]) for b in sh('git', 'branch', '--format=%(refname:short)', '--list', 'fix/issue-*').stdout.split()}
    open_ = {i['number'] for i in issues}
    st['waiting'] = {k: n for k, n in st['waiting'].items() if n in open_}  # a closed lesson frees its job for one more try
    job = next_job(prs, issues, saved, set(st['waiting']), gate_rejected)
    if not job:
        return
    kind, number, key = job
    if dry:
        print(f'Would work {kind} {number}.')
        return
    ref = f'refs/heads/fix/issue-{number}' if kind == 'issue' else ''  # checkpoints are local commits
    before = tip(ref) if ref else ''
    role = ['--role', 'coach'] if kind == 'issue' and LESSON in labels(next(i for i in issues if i['number'] == number)) else []
    cmd = [sys.executable, ROOT / 'factory' / ('builder.py' if kind == 'issue' else 'pr_team.py'), str(number), *role, *(['--merge'] if kind == 'pr' else [])]
    print(f'[foreman] {kind} {number}', flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT, capture_output=True, text=True)
    out = r.stdout + r.stderr
    print(out[-4000:], flush=True)
    if r.returncode and 'is already being worked' in out:
        return  # a manager pass has it; not a failure
    try:
        settle(st, r, out, kind, number, key, ref, before, role, prs)
    except SystemExit as e:  # a GitHub write failed; pause instead of rerunning the same job every start
        print(f'[foreman] {e}', flush=True)
        st['cooldown_until'] = time.time() + 600
    STATE.write_text(json.dumps(st, indent=1))
    record({'kind': 'foreman', 'job': key, 'exit': r.returncode, 'tail': out[-600:]})


def settle(st, r, out, kind, number, key, ref, before, role, prs):
    if r.returncode and QUOTA.search(out):
        st['cooldown_until'] = time.time() + 1800  # the subscription is resting; nothing will run until it's back
    else:
        sh('git', 'fetch', '-q', 'origin')
        moved = bool(ref) and tip(ref) != before
        if r.returncode and not moved:
            # No progress: evaluate once instead of spending tokens on retries.
            if role:
                stuck = [number] + [int(k.split('-')[1].split('@')[0]) for k, n in st['waiting'].items() if n == number]
                for n in stuck:
                    which = 'pr' if any(p['number'] == n for p in prs) else 'issue'
                    sh('gh', which, 'edit', str(n), '--repo', REPO, '--add-label', STUCK)
                    sh('gh', which, 'comment', str(n), '--repo', REPO, '--body', f'The coach couldn\'t work out how to unblock this, so it is labelled `{STUCK}` for the manager to rescope, split, or fix the cause.')
            else:
                st['waiting'][key] = learn(kind, number, out)


if __name__ == '__main__':
    main()
