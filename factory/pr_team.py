#!/usr/bin/env python3
"""Works one PR through Qodo: triage bot judges each finding, fixer bot fixes the real ones, Qodo reviews the fixes.

Usage: python3 factory/pr_team.py <pr-number> [--merge]
This script does all git and Qodo writes, and alone decides on merging. Merging also needs --merge.
"""
import fcntl, hashlib, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / 'factory' / 'agents'
QODO = str(Path.home() / '.qodo/bin/qodo')
REPO = 'Wrhinkle/swarmbreak'
ROUNDS, QODO_WAIT = 2, 300
REREQUEST_START_WAIT = 3600  # Allow a queued review to appear across foreman passes.
WAITING = 75  # EX_TEMPFAIL: Qodo hasn't reviewed the head yet. The foreman rechecks later; it isn't a failure.
OPEN = {'pending', 'partial_implementation', 'not_implemented', 'focus_areas_edited'}
# Agents may fix factory code; every factory/ change still goes to the gate reviewer (gated_paths). Locked: the rules,
# hosting, install scripts that run on this Mac, the balance limits, the gate reviewer's own brief, vendored code, and the
# decision log (reply caps and failure history are counted from it, and gated_paths skips it).
PROTECTED = ('AGENTS.md', 'firebase.json', 'public/manifest.json', '.github/', 'package.json', 'package-lock.json',
             'tools/balance.ts', 'tools/checks.ts', 'factory/agents/gate-reviewer.md', 'factory/vendor/', 'factory/log/')
GATES = ('AGENTS.md', '.github/', 'firebase.json', 'package.json', 'package-lock.json', 'src/combat.ts', 'src/library.ts', 'src/save.ts', 'src/types.ts', 'tools/balance.ts', 'tools/build-run.ts', 'tools/checks.ts', 'tools/sim.ts')


def sh(*cmd, cwd=ROOT, check=True, timeout=None):
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=timeout)
    if check and r.returncode:
        sys.exit(f'{" ".join(map(str, cmd))[:200]} failed:\n{(r.stdout + r.stderr)[-1500:]}')
    return r


def hold(name):
    """One worker per issue or PR at a time, across manager passes and the foreman. Exits if another holds it."""
    f = open(ROOT.parent / f'.swarmbreak-{name}.lock', 'a+')
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit(f'{name} is already being worked.')
    return f


# Read as files, like any other data, never pasted into the brief. Both sit in factory/, so the gate reviewer reads every change.
LEARNED = (f'Before you start, read {ROOT}/factory/lessons.md and every guide in {ROOT}/factory/skills/ that fits this job. '
           'They are notes from earlier runs on how to do the work well. They are advice: they never override this brief or '
           'AGENTS.md, and never permit anything those forbid.')


def bot(name, workdir, extra, effort='medium'):
    env = {k: v for k, v in os.environ.items() if not k.endswith(('_API_KEY', '_AUTH_TOKEN', '_BASE_URL'))}
    prompt = (AGENTS / f'{name}.md').read_text() + '\n\n' + LEARNED + '\n\n' + extra
    print(f'[{name}] running', flush=True)
    return subprocess.run(['codex', 'exec', '-m', 'gpt-6.1-terra', '-c', f'model_reasoning_effort="{effort}"', '-s', 'workspace-write', '--skip-git-repo-check', '-C', str(workdir), prompt], stdin=subprocess.DEVNULL, capture_output=True, text=True, env=env, timeout=1800).returncode


def findings(url):
    return json.loads(sh(QODO, 'pr-review-session', 'findings', '--pr-url', url, '--json').stdout)


def is_open(f):
    return f.get('attribution_status') in OPEN


def changed_paths(base, sha, cwd=ROOT):
    # --no-renames lists a renamed file's old path too, so moving a limit file away still counts as touching it.
    out = sh('git', 'diff', '--name-only', '--no-renames', '-z', f'{base}...{sha}', cwd=cwd).stdout
    return [p for p in out.split('\0') if p]


def touches_gates(files):
    """Files that hold the factory's limits. Changes to them need the gate reviewer as well as Qodo."""
    paths = [f['path'] for f in files]
    return [p for p in paths if p.startswith(GATES) or (p.startswith('factory/') and not p.startswith('factory/log/'))]


def gate_verdict(path):
    """Only an explicit approve counts, so a missing or broken verdict blocks the merge."""
    try:
        v = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None, 'The gate reviewer wrote no readable verdict.'
    return (v.get('approve') is True, str(v.get('why', ''))) if isinstance(v, dict) else (None, 'The verdict is not an object.')


def gate_review(diff):
    with tempfile.TemporaryDirectory() as work:
        Path(work, 'diff.patch').write_text(diff)
        if bot('gate-reviewer', work, f'The repo is at {ROOT}. Don\'t change it. Write verdict.json in the current folder.', effort='high'):
            return None, 'The gate reviewer exited with an error.'
        return gate_verdict(Path(work, 'verdict.json'))


def sandboxed(cmd, tree):
    """Checks run code an agent wrote. They run on a throwaway clone of the tree, so nothing they write can end up in
    the commit, with no network, writes only inside that throwaway folder, and no reads of home-folder files (gh, git
    and codex tokens live there) apart from the clone."""
    with tempfile.TemporaryDirectory(prefix='sbx-') as box:
        box = Path(box).resolve()
        copy, fake = box / 'tree', box / 'home'
        fake.mkdir()
        # cp -c clones on APFS, so even node_modules copies in moments.
        subprocess.run(['cp', '-cR', f'{Path(tree).resolve()}/', str(copy)], check=True, capture_output=True)
        home = Path.home().resolve()
        profile = ('(version 1)(allow default)(deny network*)'
                   '(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.securityd.xpc"))'
                   f'(deny file-write*)(allow file-write* (subpath "{box}") (literal "/dev/null") (literal "/dev/tty"))'
                   f'(deny file-read-data (subpath "{home}"))(allow file-read-data (subpath "{box}"))')
        env = {'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
               'HOME': str(fake), 'TMPDIR': str(fake), 'TMP': str(fake), 'TEMP': str(fake),
               'XDG_CACHE_HOME': str(fake), 'npm_config_cache': str(fake / 'npm'),
               'npm_config_update_notifier': 'false', 'PYTHONDONTWRITEBYTECODE': '1',
               'SWARMBREAK_SANDBOX': '1'}
        return subprocess.run(['sandbox-exec', '-p', profile, *cmd], cwd=copy, capture_output=True, text=True, stdin=subprocess.DEVNULL, env=env)


def sandbox_works():
    """Asserts the sandbox still blocks home-folder reads, network and writes outside the checkout. verified() runs this
    on the host, outside any sandbox, before every check, so a broken sandbox stops verification instead of passing it."""
    import socket
    with tempfile.TemporaryDirectory(dir=Path.home().resolve()) as secret, tempfile.TemporaryDirectory() as tree:
        Path(secret, 'token').write_text('x')
        assert sandboxed(['cat', f'{secret}/token'], tree).returncode
        assert sandboxed(['touch', f'{secret}/w'], tree).returncode
        assert sandboxed(['python3', '-c', 'import socket; socket.create_connection(("1.1.1.1", 443), 3)'], tree).returncode
        assert sandboxed(['sh', '-c', 'echo ok > out'], tree).returncode == 0
        # Checks run on a copy, so nothing they write reaches the tree that gets committed.
        assert not Path(tree, 'out').exists()
        # Host credentials and sockets are unavailable, even in shared temporary directories.
        os.environ['AWS_SECRET_ACCESS_KEY'] = 'dummy-secret'
        sock = socket.socket(socket.AF_UNIX)
        sock.bind(str(Path(secret, 'agent.sock')))
        sock.listen()
        try:
            assert sandboxed(['python3', '-c', 'import os; assert "AWS_SECRET_ACCESS_KEY" not in os.environ'], tree).returncode == 0
            assert sandboxed(['python3', '-c', 'import socket, sys; s=socket.socket(socket.AF_UNIX); s.connect(sys.argv[1])', str(Path(secret, 'agent.sock'))], tree).returncode
        finally:
            sock.close()
            del os.environ['AWS_SECRET_ACCESS_KEY']

class HostVerificationError(Exception):
    """The host could not safely run verification."""


def verified(tree):
    print('Host verification: checking sandbox isolation', flush=True)
    try:
        sandbox_works()
    except (AssertionError, OSError, subprocess.SubprocessError) as exc:
        failure = f'Host verification: sandbox isolation failed ({type(exc).__name__}: {exc})'
        print(failure, flush=True)
        raise HostVerificationError(failure) from exc
    print('Host verification: sandbox isolation passed', flush=True)
    for cmd in (['npm', 'run', 'build'], ['npm', 'test'], ['python3', 'factory/test_manager.py']):
        try:
            r = sandboxed(cmd, tree)
        except (OSError, subprocess.SubprocessError) as exc:
            raise HostVerificationError(f'Host verification: could not run {" ".join(cmd)} ({type(exc).__name__}: {exc})') from exc
        if r.returncode:
            print(f'Host verification: {" ".join(cmd)} failed (exit {r.returncode})', flush=True)
            return (r.stdout + r.stderr)[-2000:] or f'{" ".join(cmd)} failed with exit {r.returncode} (no output)'
        print(f'Host verification: {" ".join(cmd)} passed', flush=True)
    return ''


def merges_cleanly(tree, base):
    # Local only. Qodo skips commits that don't change a PR's diff, so a pushed catch-up could never pass the exact-commit check.
    if sh('git', 'merge', '-q', '--no-edit', f'origin/{base}', cwd=tree, check=False).returncode:
        sh('git', 'merge', '--abort', cwd=tree, check=False)
        return False
    return True


def reviewed(s, sha):
    """Only a review Qodo marked complete, of exactly this commit, counts. Never loosen this: it is the merge check."""
    return s.get('commit_sha') == sha and bool(s.get('review_complete'))


def stalled(s, sha):
    """Qodo sometimes ends a review of sha with status completed but review_complete false. Waiting won't finish it."""
    return s.get('commit_sha') == sha and s.get('status') == 'completed' and not s.get('review_complete')


def rerequest_state(url, sha):
    """Keep the request and observed start across foreman processes, separately for each PR and commit."""
    cache = Path.home() / '.cache'
    key = hashlib.sha256(f'{url}\0{sha}'.encode()).hexdigest()
    path = cache / 'swarmbreak-qodo-requests' / key
    if path.exists():
        try:
            state = json.loads(path.read_text())
            if (isinstance(state, dict) and type(state.get('requested_at')) in (int, float)
                    and type(state.get('started')) is bool):
                return path, state
        except (OSError, ValueError, UnicodeError):
            pass
        # The file may represent an already-posted request. Wait for Qodo rather than post again.
        return path, {'requested_at': time.time(), 'started': False}
    # Honor requests recorded by older versions; do not post a second /review after upgrading.
    legacy = cache / 'swarmbreak-qodo-rerequested'
    if legacy.exists() and sha in legacy.read_text().split():
        return path, {'requested_at': legacy.stat().st_mtime, 'started': False}
    return path, None


def save_rerequest(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as f:
            name = f.name
            json.dump(state, f)
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def wait_for_review(url, sha):
    deadline = time.time() + QODO_WAIT
    path, request = rerequest_state(url, sha)
    while time.time() < deadline:
        s = findings(url).get('review_session') or {}
        if reviewed(s, sha):
            return
        if stalled(s, sha):
            if request is None:
                sh('gh', 'pr', 'comment', url, '--body', '/review')
                request = {'requested_at': time.time(), 'started': False}
                save_rerequest(path, request)
                break
            if request['started']:
                sys.exit(f'Qodo ended its review of {sha[:7]} incomplete again after a /review request. Not merging.')
        elif s.get('commit_sha') == sha and s.get('status') in ('pending', 'queued', 'running', 'in_progress') and request and not request['started']:
            request['started'] = True
            save_rerequest(path, request)
        if s.get('commit_sha') == sha and s.get('status') == 'failed':
            sys.exit(f'Qodo\'s review of {sha[:7]} failed. A PR of tens of thousands of lines can do this, so split it. Not merging.')
        if s.get('commit_sha') == sha and s.get('status') == 'skipped':
            sys.exit(f'Qodo skipped {sha[:7]}, so it has no review. Not merging.')
        if request and not request['started'] and time.time() - request['requested_at'] >= REREQUEST_START_WAIT:
            break  # Still outstanding; a later foreman pass will check again.
        time.sleep(30)
    print(f'Waiting on Qodo to review {sha[:7]}. The foreman will check again later.', flush=True)
    print(f'Qodo waiting head: {sha}', flush=True)
    sys.exit(WAITING)


def fixer_state(number):
    """Host-owned ledger, separate for each repository and PR."""
    key = hashlib.sha256(f'{REPO}\0{number}'.encode()).hexdigest()
    directory = Path.home() / '.cache' / 'swarmbreak-fixer-rounds' / key
    path = directory / 'commits.json'
    try:
        directory.mkdir(parents=True)
    except FileExistsError:
        pass
    else:
        save_rerequest(path, [])
    try:
        commits = json.loads(path.read_text())
        if (not isinstance(commits, list) or len(commits) > ROUNDS
                or any(not isinstance(c, str) or not re.fullmatch(r'[0-9a-f]{40,64}', c) for c in commits)
                or len(set(commits)) != len(commits)):
            raise ValueError('invalid commit ledger')
    except (OSError, ValueError, UnicodeError) as exc:
        sys.exit(f'Fixer ledger for PR {number} is missing or corrupt; stopping: {exc}')
    if (directory / 'pending').exists():
        sys.exit(f'Fixer commit for PR {number} was interrupted while recording; stopping for inspection.')
    return path, commits


def fixer_rounds(tree, number, base):
    """Count recorded commits, including attempts interrupted before or during a push."""
    _, commits = fixer_state(number)
    history = set(sh('git', 'rev-list', f'origin/{base}..HEAD', cwd=tree).stdout.splitlines())
    missing = [sha for sha in commits if sha not in history]
    if missing:
        print(f'{len(missing)} recorded fixer commit(s) are absent from PR history; retaining their budget.', flush=True)
    return len(commits)


def begin_fixer_commit(number):
    path, commits = fixer_state(number)
    if len(commits) >= ROUNDS:
        sys.exit(f'Fixer budget for PR {number} is exhausted.')
    (path.parent / 'pending').touch(exist_ok=False)
    return path, commits


def record_fixer_commit(tree, number, path, commits):
    sha = sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip()
    if not re.fullmatch(r'[0-9a-f]{40,64}', sha) or sha in commits or len(commits) >= ROUNDS:
        sys.exit(f'Cannot record fixer commit for PR {number}; stopping before push.')
    save_rerequest(path, commits + [sha])
    (path.parent / 'pending').unlink()


def main():
    number, merge = sys.argv[1], '--merge' in sys.argv
    pr = json.loads(sh('gh', 'pr', 'view', number, '--repo', REPO, '--json', 'url,headRefName,baseRefName,state,headRefOid').stdout)
    if pr['state'] != 'OPEN':
        sys.exit(f'PR {number} is {pr["state"]}.')
    url, head, base = pr['url'], pr['headRefName'], pr['baseRefName']
    _lock = hold(f'pr-{number}')  # noqa: F841 - held until exit
    tree = ROOT.parent / f'swarmbreak-pr-{number}'
    sh('git', 'fetch', '-q', 'origin')
    if not tree.exists():
        sh('git', 'worktree', 'add', '-q', '--detach', tree, f'origin/{head}')
    if sh('git', 'status', '--porcelain', cwd=tree).stdout.strip():
        # A fixer that didn't get to green leaves its attempt here. Keep it on a local branch and start this run clean.
        keep = f'leftover/pr-{number}-{int(time.time())}'
        sh('git', 'add', '-A', cwd=tree)
        sh('git', 'commit', '-q', '--no-verify', '-m', f'Unfinished fixer attempt on PR #{number}', cwd=tree)
        sh('git', 'branch', keep, 'HEAD', cwd=tree)
        print(f'Kept the last unfinished attempt on {keep}.', flush=True)
    sh('git', 'checkout', '-q', '--detach', f'origin/{head}', cwd=tree)
    if not (tree / 'node_modules').exists():
        sh('npm', 'ci', '--silent', cwd=tree)
    # An unfinished review lists no findings yet, which isn't the same as a clean one.
    wait_for_review(url, sh('git', 'rev-parse', 'HEAD', cwd=tree).stdout.strip())
    for round_no in range(fixer_rounds(tree, number, base), ROUNDS + 1):
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
                try:
                    failed = verified(tree)
                except HostVerificationError as exc:
                    (tree / '.git-fixes.json').unlink()
                    sys.exit(f'Host verification stopped; nothing was pushed. The attempt is in {tree}.\n{exc}')
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
            ledger, commits = begin_fixer_commit(number)
            sh('git', 'commit', '-q', '-m', f'Fix Qodo findings on PR #{number}\n\n{titles}\n\n{attribution}', cwd=tree)
            record_fixer_commit(tree, number, ledger, commits)
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
    base_sha = sh('git', 'rev-parse', f'origin/{base}').stdout.strip()
    session = data.get('review_session') or {}
    still = [f for f in data['findings'] if is_open(f)]
    sh('git', 'checkout', '-q', '--detach', sha, cwd=tree)
    blocks = []
    if not reviewed(session, sha):
        blocks.append(f'Qodo has no finished review of {sha[:7]} (last: {str(session.get("commit_sha"))[:7]}, {session.get("status")})')
    if still:
        blocks.append(f'{len(still)} open findings: ' + '; '.join(f['title'] for f in still))
    # Build and test what main would become, so a PR behind main can't overwrite newer work.
    # ponytail: main can still move before the merge call below; a merge queue closes that gap if merges get frequent.
    if not merges_cleanly(tree, base):
        blocks.append(f'{head} conflicts with {base}')
    else:
        try:
            failed = verified(tree)
        except HostVerificationError as exc:
            sys.exit(f'Not ready to merge: {exc}')
        if failed:
            blocks.append(f'Build or tests fail with {base} merged in: {failed[-500:]}')
    if blocks:
        sys.exit('Not ready to merge:\n- ' + '\n- '.join(blocks))
    if not merge:
        print(f'PR {number} passes every check at {sha[:7]}. Run with --merge to merge it.')
        return
    # Reviewed last and merged by commit, so the reviewer's approval covers exactly what lands.
    gates = touches_gates([{'path': n} for n in changed_paths(f'origin/{base}', sha)])
    if gates:
        approved, why = gate_review(sh('git', 'diff', '--no-renames', f'origin/{base}...{sha}').stdout)
        print(f'Gate review of {sha[:7]}: {"approved" if approved else "rejected" if approved is False else "did not run"}. {why[:400]}', flush=True)
        if approved is None:  # an outage isn't a decision, so it leaves no rejection comment to skip on
            sys.exit(f'Gate review of PR {number} did not run: {why}. Not merging.')
        if not approved:
            sh('gh', 'pr', 'comment', number, '--repo', REPO, '--body', f'Gate reviewer rejected {sha[:7]}:\n\n{why[:3000]}')
            sys.exit(f'Gate reviewer rejected PR {number}. Not merging.')
        if sh('git', 'ls-remote', 'origin', f'refs/heads/{base}').stdout.split()[:1] != [base_sha]:
            sys.exit(f'{base} moved during the gate review. Not merging; rerun to check against the new {base}.')
    sh('gh', 'pr', 'merge', number, '--repo', REPO, '--merge', '--match-head-commit', sha)
    print(f'Merged PR {number} at {sha[:7]}.')


if __name__ == '__main__':
    main()
