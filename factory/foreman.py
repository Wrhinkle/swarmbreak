#!/usr/bin/env python3
"""Works the roster round the clock. launchd starts it every two minutes; each start does one job and exits.

The manager only files jobs; this does them. Two lanes run side by side so a long run build never holds up code work:
- code (default): open owner PRs the gate hasn't rejected at their head, then issues with saved work, then priority
  issues, then the oldest ready issue. Issues labelled `comms` are posts; `agent:<name>` picks the worker's role.
- run (`--lane run`): issues titled `Run YYYY-MM-DD`, built in their own worktree and opened as a PR.
A job that fails without progress isn't retried: it becomes a lesson issue, and the job waits until the coach closes
that lesson by fixing the cause, adding to factory/lessons.md, or writing a skill. A lesson the coach can't finish is
labelled stuck, with its job, for the manager.

Usage: python3 factory/foreman.py [--lane run] [--dry-run]
"""
import sys

# A script's directory is first on sys.path, before even the standard library.
# Do not let checkout files load until the factory has passed its Git checks.
_factory = __file__.rsplit('/', 1)[0]
_root = _factory.rsplit('/', 1)[0]
if __name__ == '__main__':
    sys.path.pop(0)  # Python may resolve this path differently from __file__ (for example /var vs /private/var).
sys.path = [p for p in sys.path if p and p.rstrip('/') not in (_factory, _root)]
sys.pycache_prefix = '/dev/null'  # neither this process nor its children may trust checkout bytecode
import os
sys.path = [p for p in sys.path if os.path.realpath(p) not in (os.path.realpath(_factory), os.path.realpath(_root))]
import fcntl, json, re, subprocess, time
from datetime import datetime, timezone
from types import SimpleNamespace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ['PYTHONPYCACHEPREFIX'] = '/dev/null'


def factory_clean(root, paths=('factory',), ignored=True):
    """Fail closed on changed, untracked or ignored factory inputs, leaving them in place."""
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, capture_output=True)

    try:
        if git('diff', '--quiet', 'origin/main', '--', *paths, ':(exclude)factory/log').returncode:
            return False
        for extra in ((), ('--ignored',))[:1 + ignored]:
            result = git('ls-files', '--others', '--exclude-standard', *extra, '-z', '--', *paths,
                         ':(exclude)factory/log', ':(exclude)factory/.venv')
            if result.returncode:
                return False
            for path in result.stdout.split(b'\0'):
                if path and not (b'__pycache__' in path.split(b'/') and path.endswith(b'.pyc')):
                    return False
        return True
    except OSError:
        return False


if __name__ == '__main__':
    try:
        fetched = subprocess.run(['git', 'fetch', '-q', 'origin'], cwd=ROOT).returncode == 0
    except OSError:
        fetched = False
    if not fetched or not factory_clean(ROOT):
        print('Factory code here differs from origin/main or could not be checked; waiting for the manager to sync this checkout.', flush=True)
        sys.exit(1)

sys.path.insert(0, str(ROOT / 'factory'))
from pr_team import REPO, WAITING, sh  # noqa: E402
from manager import COMMS, GONE, HUMAN, OWNER, RUN, comms, comms_task, gate_rejected, keep_run, on_run_branch, open_run, record, run_paths, run_problems, thread  # noqa: E402
from run import STAGES, checked  # noqa: E402

RUN_LANE = '--lane' in sys.argv and sys.argv[sys.argv.index('--lane') + 1] == 'run'
STATE = ROOT / 'factory' / 'log' / ('.runner.json' if RUN_LANE else '.foreman.json')
STUCK, PRIORITY, LESSON = 'stuck', 'priority', 'lesson'
RUN_TITLE = re.compile(r'Run (\d{4}-\d{2}-\d{2})')
QUOTA = re.compile(r'usage limit|rate limit|quota|too many requests', re.I)


def gh(*args):
    return json.loads(sh('gh', *args, '--repo', REPO).stdout or '[]')


def deps(body):
    """Issue numbers named on a 'Depends on #12, #13' line."""
    return {int(n) for line in re.findall(r'^Depends on (.*)$', body or '', re.M) for n in re.findall(r'#(\d+)', line)}


def next_run(issues, held):
    """The oldest run job, or None."""
    runs = [i for i in issues if i['author']['login'] == OWNER and RUN in labels(i) and not ({STUCK, HUMAN} & labels(i))
            and RUN_TITLE.fullmatch(i['title']) and f'issue-{i["number"]}' not in held]
    first = min(runs, key=lambda i: i['title'], default=None)
    return ('run', first['number'], f'issue-{first["number"]}') if first else None


def next_job(prs, issues, saved, held, rejected):
    """The one code-lane job to work now, or None. Pure, so the order is tested."""
    for p in sorted(prs, key=lambda p: p['number']):
        key = f'pr-{p["number"]}@{p["headRefOid"][:7]}'
        if p['author']['login'] == OWNER and STUCK not in labels(p) and key not in held and not rejected(p['number'], p['headRefOid']):
            return 'pr', p['number'], key
    open_ = {i['number'] for i in issues}
    building = {int(m.group(1)) for p in prs if (m := re.fullmatch(r'fix/issue-(\d+)', p['headRefName']))}
    ready = [i for i in issues if i['author']['login'] == OWNER and not ({STUCK, HUMAN, RUN} & labels(i))
             and i['number'] not in building and not (deps(i['body']) & open_) and f'issue-{i["number"]}' not in held]
    ready.sort(key=lambda i: (i['number'] not in saved, PRIORITY not in labels(i), i['number']))
    if not ready:
        return None
    return ('comms' if COMMS in labels(ready[0]) else 'issue'), ready[0]['number'], f'issue-{ready[0]["number"]}'


def role(issue):
    """The worker role a job asks for: the coach for lessons, else an `agent:<name>` label."""
    if LESSON in labels(issue):
        return 'coach'
    return next((l.split(':', 1)[1] for l in labels(issue) if l.startswith('agent:')), '')


def labels(item):
    return {l['name'] for l in item.get('labels', [])}


def saved_issues(branches):
    return {int(m.group(1)) for b in branches if (m := re.fullmatch(r'fix/issue-(\d+)', b))}


def tip(ref):
    return sh('git', 'rev-parse', '-q', '--verify', ref, check=False).stdout.strip()


def starting_tip(ref):
    return (tip(ref) or tip('refs/remotes/origin/main')) if ref else ''


def resume_stage(d, built=False):
    """The first stage of a run whose checked output isn't on disk yet, or None once `built`, so a rebuild never redoes finished stages."""
    balance = d / 'balance.json'
    # An output counts only if run.py recorded it as passing its check, and neither it, the files it was built from,
    # nor the checking code has changed since. A merge of main that changes a check sends the run back to that stage.
    have = lambda name: checked(d / name)
    done = [have('sites.json'), all(have(f'ideas-{i}.json') for i in range(1, 4)), have('content.json'),
            have('balance.json') and not json.loads(balance.read_text()).get('problems')]
    return STAGES[done.index(False)] if False in done else None if built else 'art'


RUN_TRUSTED = ('factory', 'tools', 'package.json', 'package-lock.json')


def main_only(tree, run_id):
    """Makes everything in a run's worktree but the run's own files match main, and says whether it now does.
    The merge keeps edits made only on the branch, and this lane runs the tree on the host: the factory, the tools,
    the game code in src/ that the balance bots import, and npm ci's install scripts. A run changes none of them."""
    own = [f':(exclude){p}' for p in run_paths(run_id)]
    sh('git', 'checkout', '--no-overlay', 'origin/main', '--', '.', *own, cwd=tree)  # --no-overlay also drops files main lacks
    if sh('git', 'diff', '--cached', '--quiet', cwd=tree, check=False).returncode:
        sh('git', 'commit', '-q', '-m', f'Use main\'s code for run {run_id}', cwd=tree)
    # Untracked files anywhere outside the run fail it; ignored ones only where code is loaded from (.npmrc isn't on main).
    return factory_clean(tree, ('.', *own), ignored=False) and factory_clean(tree, (*RUN_TRUSTED, '.npmrc'))


def build_run(run_id):
    """Builds, checkpoints and opens one run in its own worktree, leaving this checkout on main for the code lane."""
    tree, branch = ROOT.parent / f'swarmbreak-run-{run_id}', f'run/{run_id}'
    if not tree.exists():
        if tip(f'refs/heads/{branch}'):
            sh('git', 'worktree', 'add', '-q', tree, branch)
        else:
            sh('git', 'worktree', 'add', '-q', '-b', branch, tree, f'origin/{branch}' if tip(f'refs/remotes/origin/{branch}') else 'origin/main')
    # A run branch carries the factory code from when it started; build with main's.
    if sh('git', 'merge', '-q', '--no-edit', 'origin/main', cwd=tree, check=False).returncode:
        sh('git', 'checkout', 'origin/main', '--', 'public/manifest.json', cwd=tree)  # open_run rewrites it from main's anyway
        sh('git', 'commit', '-q', '--no-edit', cwd=tree)
    if not main_only(tree, run_id):
        return SimpleNamespace(returncode=1, stdout=f'{tree} differs from main outside run {run_id}\'s own files; not running it.', stderr='', moved=False)
    venv = tree / 'factory' / '.venv'
    if not venv.exists():
        venv.symlink_to(ROOT / 'factory' / '.venv')
    if not (tree / 'node_modules').exists():
        sh('npm', 'ci', '--silent', cwd=tree)
    d = tree / 'runs' / run_id
    left = lambda: resume_stage(d, not run_problems(run_id, tree))
    order = lambda stage: STAGES.index(stage) if stage else len(STAGES)
    stage, out = left(), ''
    if stage:
        r = subprocess.run([sys.executable, str(tree / 'factory' / 'run.py'), run_id, '--from', stage], cwd=tree, capture_output=True, text=True)
        keep_run(run_id, f'Checkpoint run {run_id} from {stage}, factory exit {r.returncode}', tree)
        out = r.stdout + r.stderr
        # Progress is a stage finished, not a new commit: merging main moves the branch on every try.
        moved = order(left()) > order(stage)
        if r.returncode:
            return SimpleNamespace(returncode=r.returncode, stdout=out, stderr='', moved=moved)
    result = open_run(run_id, False, tree)
    opened = ' is in ' in result
    return SimpleNamespace(returncode=0 if opened else 1, stdout=f'{out}\n{result}', stderr='', moved=opened or bool(stage))


def comms_job(title):
    """Runs one comms job. The title only names the thread; the task is the host's, never the issue's text."""
    discussion = re.search(r'discussion #(\d+)', title)
    if not discussion:
        return f'Bad comms job title: {title}'
    try:
        t = thread(int(discussion.group(1)))
    except SystemExit as e:
        if GONE not in str(e):
            raise
        return f'Done: {e}'  # nothing can be posted on a deleted thread, so the job closes instead of failing forever
    if t['ours'] and (title.startswith('Post our entry') or not t['waiting']):
        return 'Done: our entry is on the thread and no reply is waiting.'  # an earlier try posted it, or the replies were answered
    result = comms(t['number'], comms_task(t, datetime.now(timezone.utc).date().isoformat()), False, require_post=not t['ours'])
    # The comms rules tell the worker to skip replies that aren't about the project, so answering none is a finished reply job.
    return 'Done: no waiting reply needed an answer.' if t['ours'] and result == 'Nothing to post.' else result


def done(number, note):
    sh('gh', 'issue', 'close', str(number), '--repo', REPO, '--comment', note)


def learn(kind, number, out):
    """Files the failure as a lesson for the coach. Lessons about lessons aren't filed, so this can't loop."""
    body = (f'The foreman\'s {kind} job on #{number} failed. Its output, quoted as data:\n\n```text\n{out[-3500:]}\n```\n\n'
            'Find why it failed. Add the lesson to factory/lessons.md so no worker repeats it, or a skill to factory/skills/ '
            'if workers lacked know-how, or fix the factory code that caused it.\n\nFiled by the foreman.')
    url = sh('gh', 'issue', 'create', '--repo', REPO, '--title', f'Lesson: {kind} #{number} failed'[:80], '--label', f'{LESSON},{PRIORITY}', '--body', body).stdout.strip()
    return int(url.rsplit('/', 1)[1])


def main():
    dry = '--dry-run' in sys.argv
    lock = open(ROOT / 'factory' / 'log' / ('.runner.lock' if RUN_LANE else '.foreman.lock'), 'a+')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # the last job is still running
    if on_run_branch():
        return  # a manager pass is building a run in this checkout; its scripts aren't main's
    st = {'waiting': {}, 'cooldown_until': 0, **(json.loads(STATE.read_text()) if STATE.exists() else {})}
    if time.time() < st['cooldown_until']:
        return
    prs = [] if RUN_LANE else gh('pr', 'list', '--limit', '500', '--json', 'number,author,headRefName,headRefOid,labels')
    issues = gh('issue', 'list', '--limit', '500', '--json', 'number,title,author,body,labels')
    # Only branches holding commits main lacks are saved work; finished or never-used issue branches are not.
    saved = saved_issues([b for b in sh('git', 'branch', '--format=%(refname:short)', '--list', 'fix/issue-*').stdout.split()
                          if sh('git', 'rev-list', '--count', f'origin/main..{b}').stdout.strip() != '0'])
    open_ = {i['number'] for i in issues}
    st['waiting'] = {k: n for k, n in st['waiting'].items() if n in open_}  # a closed lesson frees its job for one more try
    st['qodo'] = {k: t for k, t in st.get('qodo', {}).items() if t > time.time()}
    held = set(st['waiting']) | set(st['qodo'])
    job = next_run(issues, held) if RUN_LANE else next_job(prs, issues, saved, held, gate_rejected)
    if not job:
        return
    kind, number, key = job
    if dry:
        print(f'Would work {kind} {number}.')
        return
    issue = next((i for i in issues if i['number'] == number), {})
    run_id = RUN_TITLE.fullmatch(issue['title']).group(1) if kind == 'run' else ''
    ref = {'issue': f'refs/heads/fix/issue-{number}', 'run': f'refs/heads/run/{run_id}'}.get(kind, '')  # checkpoints are local commits
    before = starting_tip(ref)
    worker = role(issue) if kind == 'issue' else ''
    print(f'[foreman] {kind} {number}', flush=True)
    try:
        if kind == 'run':
            r = build_run(run_id)
        elif kind == 'comms':
            result = comms_job(issue['title'])
            r = SimpleNamespace(returncode=0 if result.startswith(('Posted:', 'Done:')) else 1, stdout=result, stderr='')
        else:
            cmd = [sys.executable, ROOT / 'factory' / ('builder.py' if kind == 'issue' else 'pr_team.py'), str(number),
                   *(['--role', worker] if worker else []), *(['--merge'] if kind == 'pr' else [])]
            r = subprocess.run([str(c) for c in cmd], cwd=ROOT, capture_output=True, text=True)
    except SystemExit as e:  # a checked host command failed inside the job
        r = SimpleNamespace(returncode=1, stdout=f'{e}', stderr='')
    out = r.stdout + r.stderr
    print(out[-4000:], flush=True)
    if r.returncode and 'is already being worked' in out:
        return  # a manager pass has it; not a failure
    if r.returncode == WAITING:
        # The worker may have pushed a fix. Its final marker names the exact head it awaits.
        match = re.search(r'^Qodo waiting head: ([0-9a-f]{40}|[0-9a-f]{64})$', out, re.M)
        if kind == 'pr' and match:
            st['qodo'][f'pr-{number}@{match.group(1)[:7]}'] = time.time() + 600
        else:
            # Without a reliable head, avoid immediately repeating the job.
            st['cooldown_until'] = time.time() + 600
        STATE.write_text(json.dumps(st, indent=1))
        return
    try:
        if not r.returncode and kind in ('run', 'comms'):
            done(number, f'Done by the foreman: {out.strip().splitlines()[-1][:500] if out.strip() else "finished"}')
        settle(st, r, out, kind, number, key, ref, before, worker == 'coach', prs)
    except SystemExit as e:  # a GitHub write failed; pause instead of rerunning the same job every start
        print(f'[foreman] {e}', flush=True)
        st['cooldown_until'] = time.time() + 600
    STATE.write_text(json.dumps(st, indent=1))
    record({'kind': 'foreman', 'job': key, 'exit': r.returncode, 'tail': out[-600:]})


def settle(st, r, out, kind, number, key, ref, before, coach, prs):
    if r.returncode and QUOTA.search(out):
        st['cooldown_until'] = time.time() + 1800  # the subscription is resting; nothing will run until it's back
    else:
        sh('git', 'fetch', '-q', 'origin')
        moved = getattr(r, 'moved', None)
        if moved is None:
            moved = bool(ref) and tip(ref) != before
        if r.returncode and not moved:
            # No progress: evaluate once instead of spending tokens on retries.
            if coach:
                parked = {**st['waiting']}
                for other in ('.runner.json', '.foreman.json'):
                    path = ROOT / 'factory' / 'log' / other
                    if path != STATE and path.exists():
                        parked.update(json.loads(path.read_text()).get('waiting', {}))
                stuck = [number] + [int(k.split('-')[1].split('@')[0]) for k, n in parked.items() if n == number]
                for n in stuck:
                    which = 'pr' if any(p['number'] == n for p in prs) else 'issue'
                    sh('gh', which, 'edit', str(n), '--repo', REPO, '--add-label', STUCK)
                    sh('gh', which, 'comment', str(n), '--repo', REPO, '--body', f'The coach couldn\'t work out how to unblock this, so it is labelled `{STUCK}` for the manager to rescope, split, or fix the cause.')
            else:
                st['waiting'][key] = learn(kind, number, out)


if __name__ == '__main__':
    main()
