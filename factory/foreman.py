#!/usr/bin/env python3
"""Works the roster round the clock. launchd starts it every two minutes; each start does one job and exits.

The manager only files jobs; this does them. Two lanes run side by side so a long run build never holds up code work:
- code (default): open owner PRs the gate hasn't rejected at their head, then priority issues, then issues with saved
  work, then the oldest ready issue. Priority is the manager's order, so it comes before what a worker happened to start. Issues labelled `comms` are posts; `agent:<name>` picks the worker's role.
- run (`--lane run`): issues titled `Run YYYY-MM-DD`, built in their own worktree and opened as a PR.
A failed job isn't retried: it becomes a lesson issue, and the job waits until the coach closes that lesson by fixing
the cause, adding to factory/lessons.md, or writing a skill. For the builder, failing means the pass opened no PR,
whatever it saved. A lesson the coach can't finish is labelled stuck, with its job, for the manager. So is an issue or
PR that fails again after its lesson closed: one evaluation each, then the manager rescopes it.

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
import fcntl, hashlib, json, re, subprocess, tempfile, time
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
from pr_team import LOCK_COLLISION, REPO, WAITING, sh  # noqa: E402
from manager import COMMS, GONE, HELD, HUMAN, LOG, OWNER, REFUSED, RUN, comms, comms_task, deps, gate_rejected, keep_run, on_run_branch, open_run, record, run_paths, run_problems, thread  # noqa: E402
from run import STAGES, checked, clashes  # noqa: E402

RUN_LANE = '--lane' in sys.argv and sys.argv[sys.argv.index('--lane') + 1] == 'run'
STATE = ROOT / 'factory' / 'log' / ('.runner.json' if RUN_LANE else '.foreman.json')
STUCK, PRIORITY, LESSON = 'stuck', 'priority', 'lesson'
RUN_TITLE = re.compile(r'Run (\d{4}-\d{2}-\d{2})')
QUOTA = re.compile(r'usage limit|rate limit|quota|too many requests|Codex sign-out', re.I)


def gh(*args):
    return json.loads(sh('gh', *args, '--repo', REPO).stdout or '[]')


def next_run(issues, held):
    """The oldest run job, or None."""
    runs = [i for i in issues if i['author']['login'] == OWNER and RUN in labels(i) and not ({STUCK, HUMAN} & labels(i))
            and RUN_TITLE.fullmatch(i['title']) and f'issue-{i["number"]}' not in held]
    first = min(runs, key=lambda i: i['title'], default=None)
    return ('run', first['number'], f'issue-{first["number"]}') if first else None


ENTRY = re.compile(r'Post our entry on discussion #(\d+)')
REFUSAL_KEPT = 86400  # seconds a refused delegate counts as work still wanted, unless the manager sends it again


def challenge_work(issues, discussion):
    """Open issues that name the thread: the work the manager planned for it. The manager writes `discussion #N` into that work.
    Comms jobs and lessons name threads too and aren't the work. Nor is an escalation: no worker takes it, and the manager
    can file one while other people's text is in its pass, so it must not hold an entry or be linked from one."""
    return sorted(i['number'] for i in issues if i['author']['login'] == OWNER and not ({COMMS, LESSON, HUMAN} & labels(i))
                  and re.search(rf'discussion #{discussion}\b', f"{i.get('title', '')}\n{i.get('body') or ''}"))


def unfiled(lines, now):
    """Threads with challenge work on no issue yet: a delegate naming the thread was refused, which happens while other
    people's text is in the manager's pass, and that job hasn't been filed since. Only filing lifts a refusal; a later
    try that failed some other way doesn't. `lines` is the decision log. A refusal counts for REFUSAL_KEPT: the manager
    asks again every pass while the work is wanted, so an older one is a job it dropped or renamed."""
    refused = {}
    for line in lines:
        e = json.loads(line)
        a = e.get('action')
        if e.get('kind') != 'action' or e.get('dry') or not isinstance(a, dict) or a.get('type') != 'delegate':
            continue
        task, result = str(a.get('task', '')).strip(), str(e.get('result', ''))
        title = str(a.get('title', task))[:80]  # the roster's name for the job: file_job's
        for n in re.findall(r'discussion #(\d+)\b', f"{a.get('title', '')}\n{task}"):
            if result.startswith(REFUSED) and now - datetime.fromisoformat(e['at']).timestamp() < REFUSAL_KEPT:
                refused.setdefault(n, set()).add(title)
            elif result.startswith(('Filed ', 'Already on the roster')):
                refused.get(n, set()).discard(title)
    return {n for n, titles in refused.items() if titles}


def entry_waits(i, issues, unfiled=()):
    """Whether an entry job stays unposted for now: work planned for its challenge is open or couldn't be filed yet.
    No entry goes out ahead of that work. Only finishing the work lifts the hold. The manager can close such work only when another open job names the thread,
    which moves the hold; a builder pass that finds the work done on main closes it for good."""
    m = ENTRY.fullmatch(i.get('title', ''))
    return bool(m and COMMS in labels(i) and (challenge_work(issues, m.group(1)) or m.group(1) in unfiled))


def next_job(prs, issues, saved, held, rejected, unfiled=()):
    """The one code-lane job to work now, or None. Pure, so the order is tested."""
    for p in sorted(prs, key=lambda p: p['number']):
        key = f'pr-{p["number"]}@{p["headRefOid"][:7]}'
        if p['author']['login'] == OWNER and STUCK not in labels(p) and key not in held and not rejected(p['number'], p['headRefOid']):
            return 'pr', p['number'], key
    open_ = {i['number'] for i in issues}
    building = {int(m.group(1)) for p in prs if (m := re.fullmatch(r'fix/issue-(\d+)', p['headRefName']))}
    ready = [i for i in issues if i['author']['login'] == OWNER and not ({STUCK, HUMAN, RUN} & labels(i))
             and i['number'] not in building and not (deps(i['body']) & open_) and f'issue-{i["number"]}' not in held
             and not entry_waits(i, issues, unfiled)]
    ready.sort(key=lambda i: (PRIORITY not in labels(i), i['number'] not in saved, i['number']))
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


def resume_stage(d, built=False):
    """The first stage of a run whose checked output isn't on disk yet, or None once `built`, so a rebuild never redoes finished stages."""
    balance = d / 'balance.json'
    # An output counts only if run.py recorded it as passing its check, and neither it, the files it was built from,
    # nor the checking code has changed since. A merge of main that changes a check sends the run back to that stage.
    # The sites also have to be ones no other run uses today: a run merged since the check can't be in that record.
    have = lambda name: checked(d / name)
    done = [have('sites.json') and not clashes(d), all(have(f'ideas-{i}.json') for i in range(1, 4)), have('content.json'),
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


def install(tree):
    """Installs the packages main's lockfile names, unless that lockfile's are already there.
    The stamp is inside node_modules: ignored, so in no branch, and npm ci removes it with the old packages."""
    stamp, want = tree / 'node_modules' / '.installed-from', hashlib.sha256((tree / 'package-lock.json').read_bytes()).hexdigest()
    if not stamp.exists() or stamp.read_text() != want:
        sh('npm', 'ci', '--silent', cwd=tree)
        stamp.write_text(want)


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
    install(tree)
    d = tree / 'runs' / run_id
    left = lambda: resume_stage(d, not run_problems(run_id, tree))
    order = lambda stage: STAGES.index(stage) if stage else len(STAGES)
    stage, out, moved = left(), '', False
    if stage:
        r = subprocess.run([sys.executable, str(tree / 'factory' / 'run.py'), run_id, '--from', stage], cwd=tree, capture_output=True, text=True)
        out = r.stdout + r.stderr
        # Progress is a stage finished, not a new commit: merging main moves the branch on every try.
        moved = order(left()) > order(stage)
        try:
            keep_run(run_id, f'Checkpoint run {run_id} from {stage}, factory exit {r.returncode}', tree)
        except SystemExit as e:
            return SimpleNamespace(returncode=1, stdout=f'{out}\n{e}', stderr='', moved=moved)
        if r.returncode:
            return SimpleNamespace(returncode=r.returncode, stdout=out, stderr='', moved=moved)
    result = open_run(run_id, False, tree)
    opened = ' is in ' in result
    # A build that exits 0 and still leaves the same stage to do made no progress: the refusal is evaluated once, not rebuilt every pass.
    return SimpleNamespace(returncode=0 if opened else 1, stdout=f'{out}\n{result}', stderr='', moved=opened or moved)


def open_issues():
    return gh('issue', 'list', '--limit', '500', '--json', 'number,title,author,body,labels')


def challenge_held(number):
    """Read fresh each time: whether work planned for discussion `number` is open or not filed yet."""
    return bool(challenge_work(open_issues(), number)) or str(number) in unfiled(LOG.read_text().splitlines() if LOG.exists() else [], time.time())


def comms_job(title, held=challenge_held):
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
    # Only an entry waits on the challenge's work. The worker takes minutes, so comms asks again itself before it posts.
    result = comms(t['number'], comms_task(t, datetime.now(timezone.utc).date().isoformat()), False,
                   require_post=not t['ours'], held=None if t['ours'] else lambda: held(t['number']))
    # The comms rules tell the worker to skip replies that aren't about the project, so answering none is a finished reply job.
    return 'Done: no waiting reply needed an answer.' if t['ours'] and result == 'Nothing to post.' else result


def done(number, note):
    sh('gh', 'issue', 'close', str(number), '--repo', REPO, '--comment', note)


def learn(kind, number, out):
    """Files the failure as a lesson for the coach. Lessons about lessons aren't filed, so this can't loop.
    Run and comms output can quote a crawled site or a challenge form, so a fence inside it is defused: the quote can't be closed early."""
    quoted = out[-3500:].replace('```', "'''")
    body = (f'The foreman\'s {kind} job on #{number} failed. Its output, quoted as data:\n\n```text\n{quoted}\n```\n\n'
            'Find why it failed. Add the lesson to factory/lessons.md so no worker repeats it, or a skill to factory/skills/ '
            'if workers lacked know-how, or fix the factory code that caused it.\n\nFiled by the foreman.')
    url = sh('gh', 'issue', 'create', '--repo', REPO, '--title', f'Lesson: {kind} #{number} failed'[:80], '--label', f'{LESSON},{PRIORITY}', '--body', body).stdout.strip()
    return int(url.rsplit('/', 1)[1])


def save_state(st):
    """Replace the lane state only after its complete JSON has been written."""
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=STATE.parent, delete=False) as f:
            name = f.name
            f.write(json.dumps(st, indent=1))
        os.replace(name, STATE)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


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
    st.pop('codex_pause', None)  # a later, unrelated cooldown must not inherit this cause
    prs = [] if RUN_LANE else gh('pr', 'list', '--limit', '500', '--json', 'number,author,headRefName,headRefOid,labels')
    issues = open_issues()
    # Only branches holding commits main lacks are saved work; finished or never-used issue branches are not.
    saved = saved_issues([b for b in sh('git', 'branch', '--format=%(refname:short)', '--list', 'fix/issue-*').stdout.split()
                          if sh('git', 'rev-list', '--count', f'origin/main..{b}').stdout.strip() != '0'])
    open_ = {i['number'] for i in issues}
    st['waiting'] = {k: n for k, n in st['waiting'].items() if n in open_}  # a closed lesson frees its job for one more try
    st['qodo'] = {k: t for k, t in st.get('qodo', {}).items() if t > time.time()}
    held = set(st['waiting']) | set(st['qodo'])
    log = LOG.read_text().splitlines() if LOG.exists() else []
    waiting_on = unfiled(log, time.time())
    job = next_run(issues, held) if RUN_LANE else next_job(prs, issues, saved, held, gate_rejected, unfiled=waiting_on)
    if not job:
        return
    kind, number, key = job
    if dry:
        print(f'Would work {kind} {number}.')
        return
    issue = next((i for i in issues if i['number'] == number), {})
    run_id = RUN_TITLE.fullmatch(issue['title']).group(1) if kind == 'run' else ''
    worker = role(issue) if kind == 'issue' else ''
    print(f'[foreman] {kind} {number}', flush=True)
    try:
        if kind == 'run':
            r = build_run(run_id)
        elif kind == 'comms':
            result = comms_job(issue['title'])
            # Held isn't a failure to learn from: work for the challenge opened while the worker wrote, and the job waits on it like any held entry.
            r = SimpleNamespace(returncode=0 if result.startswith(('Posted:', 'Done:')) else 1, stdout=result, stderr='', moved=result == HELD or None)
        else:
            cmd = [sys.executable, ROOT / 'factory' / ('builder.py' if kind == 'issue' else 'pr_team.py'), str(number),
                   *(['--role', worker] if worker else []), *(['--merge'] if kind == 'pr' else [])]
            r = subprocess.run([str(c) for c in cmd], cwd=ROOT, capture_output=True, text=True)
    except SystemExit as e:  # a checked host command failed inside the job
        r = SimpleNamespace(returncode=1, stdout=f'{e}', stderr='')
    out = r.stdout + r.stderr
    print(out[-4000:], flush=True)
    if kind in ('issue', 'pr') and r.returncode == LOCK_COLLISION:
        return  # a manager pass has it; not a failure
    if r.returncode == WAITING:
        # The worker may have pushed a fix. Its final marker names the exact head it awaits.
        match = re.search(r'^Qodo waiting head: ([0-9a-f]{40}|[0-9a-f]{64})$', out, re.M)
        if kind == 'pr' and match:
            st['qodo'][f'pr-{number}@{match.group(1)[:7]}'] = time.time() + 600
        else:
            # Without a reliable head, avoid immediately repeating the job.
            st['cooldown_until'] = time.time() + 600
        save_state(st)
        return
    try:
        if not r.returncode and kind in ('run', 'comms'):
            done(number, f'Done by the foreman: {out.strip().splitlines()[-1][:500] if out.strip() else "finished"}')
        settle(st, r, out, kind, number, key, worker == 'coach', prs, log)
    except SystemExit as e:  # a GitHub write failed; pause instead of rerunning the same job every start
        print(f'[foreman] {e}', flush=True)
        st['cooldown_until'] = time.time() + 600
    save_state(st)
    record({'kind': 'foreman', 'job': key, 'exit': r.returncode, 'moved': bool(getattr(r, 'moved', False)), 'lesson': st['waiting'].get(key), 'tail': out[-600:]})


def evaluated(key, log):
    """Whether this job has had its one evaluation: a lesson was filed for it, and it hasn't finished a pass since.
    `log` is the decision log. The main checkout's sync reorders it, so the records are read by their own times."""
    had = False
    for e in sorted((e for e in map(json.loads, log) if e.get('kind') == 'foreman' and e.get('job') == key), key=lambda e: e.get('at', '')):
        had = bool(e.get('exit')) and not e.get('moved') and (had or bool(e.get('lesson')))  # a run that moved starts over
    return had


def settle(st, r, out, kind, number, key, coach, prs, log=()):
    if r.returncode and QUOTA.search(out):
        st['cooldown_until'] = time.time() + 1800  # the subscription is resting; nothing will run until it's back
        st['codex_pause'] = bool(re.search(r'Codex (?:usage limit|sign-out)', out, re.I))
    elif r.returncode and not getattr(r, 'moved', False):
        # A failed pass is evaluated once instead of spending tokens on retries. Only a run says it moved: a stage finished.
        # A builder pass that opened no PR didn't, whatever it saved: issue 37 saved a hundred passes and shipped none.
        if coach:
            parked = {**st['waiting']}
            for other in ('.runner.json', '.foreman.json'):
                path = ROOT / 'factory' / 'log' / other
                if path != STATE and path.exists():
                    parked.update(json.loads(path.read_text()).get('waiting', {}))
            stuck = [number] + [int(k.split('-')[1].split('@')[0]) for k, n in parked.items() if n == number]
            why = 'The coach couldn\'t work out how to unblock this'
        elif kind in ('issue', 'pr', 'run') and evaluated(key, log):  # a run that moved returned above
            stuck, why = [number], 'This failed again after the lesson filed for it was closed'
        else:
            st['waiting'][key] = learn(kind, number, out)
            return
        for n in stuck:
            which = 'pr' if any(p['number'] == n for p in prs) else 'issue'
            sh('gh', which, 'edit', str(n), '--repo', REPO, '--add-label', STUCK)
            sh('gh', which, 'comment', str(n), '--repo', REPO, '--body', f'{why}, so it is labelled `{STUCK}` for the manager to rescope, split, or fix the cause.')


if __name__ == '__main__':
    main()
