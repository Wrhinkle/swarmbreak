#!/usr/bin/env python3
"""Run: python3 factory/test_manager.py. The gates on public posts and on what the manager can do."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from datetime import datetime, timezone
from manager import SITE, act, gate_verdict, unfilled_links, check_post, deploy_problems, post_problems, template_headings

good = f'## My rule\nSee {SITE} for it.'
assert post_problems(good, ['## My rule']) == []
assert post_problems(good, ['## Other'])
for bad in ['Hi @someone', 'me@example.com', 'Ridgeline CRM', 'token ghp_' + 'a' * 30, 'see https://evil.example/x', ' ', 'x' * 7000]:
    assert post_problems(bad), bad
assert post_problems('use `@types/node` fine') == []
assert template_headings('x\n```markdown\n## A\ntext\n## B\n```\n') == ['## A', '## B']
t = {'ours': [{'url': 'u', 'body': 'b'}], 'waiting': [{'id': 'R1', 'parent': 'C1'}], 'challenge': ''}
assert any('already' in p for p in check_post({'top_level': good}, t))
assert any('unknown id' in p for p in check_post({'replies': [{'to': 'R9', 'body': 'ok'}]}, t))
assert check_post({'replies': [{'to': 'R1', 'body': 'ok'}]}, t) == []
s = {'prs': [{'number': 9, 'author': {'login': 'stranger'}}]}
assert 'Not merging' in act({'type': 'merge_pr', 'pr': 9}, s, True)
assert 'not open' in act({'type': 'merge_pr', 'pr': 1}, s, True)
assert 'unknown' in act({'type': 'run_shell', 'cmd': 'x'}, s, True)
assert 'Bad' in act({'type': 'open_run', 'id': '../x'}, s, True)
now = datetime(2026, 11, 4, 12, 30, tzinfo=timezone.utc)
live, soon, later = {'runId': 'a'}, {'runId': 'b', 'opensAt': '2026-11-04T13:00:00Z'}, {'runId': 'b', 'opensAt': '2026-11-05T13:00:00Z'}
assert deploy_problems(soon, live, True, now) == []
assert deploy_problems(later, live, True, now)
assert deploy_problems(soon, live, False, now)
tpl = '```markdown\nAGENTS.md link:\n```'
assert unfilled_links('AGENTS.md link: Not available.', tpl)
assert unfilled_links('AGENTS.md link: https://github.com/x', tpl) == []
from builder import blocked_paths, only_wording
from manager import touches_gates
assert touches_gates([{'path': 'factory/manager.py'}]) and touches_gates([{'path': 'tools/sim.ts'}]) and touches_gates([{'path': 'factory/agents/comms.md'}])
assert touches_gates([{'path': 'src/act.ts'}, {'path': 'factory/log/notes.md'}, {'path': 'public/manifest.json'}]) == []
assert 'Not delegating' in act({'type': 'delegate', 'task': 'x'}, {'strangers': True}, True)
assert 'Bad' in act({'type': 'delegate', 'agent': 'manager', 'task': 'x'}, {}, True)
assert blocked_paths(['factory/agents/new-role.md', 'factory/agents/comms.md', 'factory/run.py', 'factory/builder.py', 'tools/sim.ts'], 'z') == []  # the builder fixes factory code; the gate reviewer reads it
assert blocked_paths(['factory/log/decisions.jsonl'], 'z') and blocked_paths(['factory/agents/gate-reviewer.md'], 'z') and blocked_paths(['factory/vendor/x.py'], 'z')
from builder import criteria
assert criteria('x\n## Acceptance criteria\n- a\n- b\n## Notes\nn') == '- a\n- b' and 'no acceptance' in criteria('just text')
assert len(criteria('y' * 70000)) < 30200 and 'issue link' in criteria('y' * 70000)
from manager import FAILED
for bad in ['PR team on 12 exited 1.', 'Builder on issue 14 exited 1: blocked', 'Could not switch to run/x', 'PR 12 was already rejected by the gate reviewer at abc1234.', 'Not deploying: main lacks the live run', 'Not opening x: missing art a.png', 'Action failed: git fetch failed']:
    assert FAILED.search(bad), bad
for good in ['PR team on 3 exited 0.', 'Builder opened PR 10. PR team exited 0.', 'Would build 2026-11-05.']:
    assert not FAILED.search(good), good
assert blocked_paths(['src/act.ts', 'runs/2026-11-05/content.json'], '2026-11-04') == []
for path in ['AGENTS.md', '.github/x.yml', 'firebase.json', 'tools/balance.ts', 'tools/checks.ts', 'package.json', 'public/manifest.json', 'runs/2026-11-04/content.json']:
    assert blocked_paths([path], '2026-11-04'), path
run = {'id': 'x', 'acts': [{'creatures': [{'id': 'a', 'name': 'A', 'blurb': 'b', 'scale': 1, 'routines': ['strike']}]}]}
reworded = {'id': 'x', 'acts': [{'creatures': [{'id': 'a', 'name': 'New', 'blurb': 'c', 'scale': 1, 'routines': ['strike']}]}]}
assert only_wording(run, reworded)
for change in [('id', 'z'), ('scale', 2), ('routines', ['finish'])]:
    other = {'id': 'x', 'acts': [{'creatures': [{**run['acts'][0]['creatures'][0], change[0]: change[1]}]}]}
    assert not only_wording(run, other), change
assert not only_wording({'a': 1}, {'a': 1, 'b': 2})
print('ok')

# A PR behind main is checked on a local merge; a conflict is reported and leaves the tree clean.
import subprocess, tempfile
from pr_team import merges_cleanly
with tempfile.TemporaryDirectory() as d:
    def git(*a):
        subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *a], cwd=d, check=True, capture_output=True)
    git('init', '-q', '-b', 'main')
    Path(d, 'a').write_text('1')
    git('add', '.'); git('commit', '-qm', 'base')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    git('checkout', '-qb', 'pr')
    Path(d, 'b').write_text('pr')
    git('add', '.'); git('commit', '-qm', 'pr')
    git('checkout', '-q', 'main')
    Path(d, 'a').write_text('2')
    git('add', '.'); git('commit', '-qm', 'main moved')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    git('checkout', '-q', 'pr')
    os.environ.update(GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t', GIT_COMMITTER_NAME='t', GIT_COMMITTER_EMAIL='t@t')
    assert merges_cleanly(d, 'main') and Path(d, 'a').read_text() == '2'
    git('reset', '-q', '--hard', 'HEAD~1')
    Path(d, 'a').write_text('3')
    git('add', '.'); git('commit', '-qm', 'conflict')
    assert not merges_cleanly(d, 'main') and Path(d, 'a').read_text() == '3'

# Only an explicit approve passes the gate review.
with tempfile.TemporaryDirectory() as d:
    v = Path(d, 'v.json')
    assert not gate_verdict(v)[0]
    for text, ok in (('{"approve": true, "why": "x"}', True), ('{"approve": "true"}', False), ('{"approve": false}', False), ('[]', False), ('nope', False)):
        v.write_text(text)
        assert (gate_verdict(v)[0] is True) is ok, text

# New agent prompts, saves and the verify scripts all count as limits; the log and ordinary source don't.
from pr_team import touches_gates
for path in ('factory/agents/brand-new.md', 'src/combat.ts', 'src/library.ts', 'src/save.ts', 'package.json', 'tools/build-run.ts', 'factory/art.py'):
    assert touches_gates([{'path': path}]), path
for path in ('factory/log/notes.md', 'src/main.ts', 'runs/2026-11-05/content.json'):
    assert not touches_gates([{'path': path}]), path

# Renaming a limit file to an ordinary path still counts as touching it.
import tempfile
from pr_team import changed_paths, sh
with tempfile.TemporaryDirectory() as d:
    git = ('git', '-c', 'user.name=t', '-c', 'user.email=t@example.com')
    sh('git', 'init', '-q', '-b', 'main', d, cwd=d)
    Path(d, 'AGENTS.md').write_text('rules\n' * 20)
    sh(*git, 'add', '.', cwd=d); sh(*git, 'commit', '-qm', 'a', cwd=d)
    sh('git', 'checkout', '-qb', 'moved', cwd=d)
    sh(*git, 'mv', 'AGENTS.md', 'notes with space.md', cwd=d); sh(*git, 'commit', '-qm', 'b', cwd=d)
    moved = changed_paths('main', 'moved', cwd=d)
    assert 'notes with space.md' in moved and touches_gates([{'path': p} for p in moved]) == ['AGENTS.md'], moved

# Earlier themes reach the researcher, and a run never sees its own or a later one.
import json as _json
from run import past_threads
with tempfile.TemporaryDirectory() as d:
    for day, thread in (('2026-11-04', 'sky'), ('2026-11-05', 'seeds'), ('2026-11-06', 'later')):
        Path(d, day).mkdir()
        Path(d, day, 'picks.json').write_text(_json.dumps({'thread': thread}))
    assert [x['thread'] for x in past_threads(Path(d), '2026-11-05')] == ['sky']

# A pass on main opens a built run from its own branch.
import types, manager as _m
real_sh, real_problems, real_switch, moves = _m.sh, _m.run_problems, _m.switch_keeping_log, []
_m.sh = lambda *c, **k: types.SimpleNamespace(stdout='main\n', stderr='', returncode=0)
_m.switch_keeping_log = lambda b: moves.append(b) or types.SimpleNamespace(returncode=0, stderr='')
_m.run_problems = lambda r: ['stop here']
assert 'stop here' in _m.open_run('2026-11-05', False) and moves == ['run/2026-11-05']
assert 'Would switch' in _m.open_run('2026-11-05', True) and moves == ['run/2026-11-05']
# A failed switch stops before anything on the wrong branch is checked or written.
_m.switch_keeping_log = lambda b: types.SimpleNamespace(returncode=1, stderr='nope')
_m.run_problems = lambda r: 1 / 0
assert 'could not switch' in _m.open_run('2026-11-05', False)
_m.sh, _m.run_problems, _m.switch_keeping_log = real_sh, real_problems, real_switch

# A run built on its own branch counts as used before it merges; a run doesn't count against itself.
from run import other_branch_json
with tempfile.TemporaryDirectory() as d:
    git = ('git', '-c', 'user.name=t', '-c', 'user.email=t@example.com')
    sh('git', 'init', '-q', '-b', 'main', d, cwd=d)
    Path(d, 'x').write_text('x'); sh(*git, 'add', '.', cwd=d); sh(*git, 'commit', '-qm', 'a', cwd=d)
    sh('git', 'checkout', '-qb', 'run/2026-11-05', cwd=d)
    Path(d, 'runs/2026-11-05').mkdir(parents=True)
    Path(d, 'runs/2026-11-05/picks.json').write_text(_json.dumps({'thread': 'sky'}))
    sh(*git, 'add', '.', cwd=d); sh(*git, 'commit', '-qm', 'b', cwd=d)
    sh('git', 'checkout', '-q', 'main', cwd=d)
    assert other_branch_json('picks.json', '2026-11-06', cwd=d) == [{'thread': 'sky'}]
    assert other_branch_json('picks.json', '2026-11-05', cwd=d) == []
    sh('git', 'checkout', '-qb', 'run/2026-11-07', cwd=d)
    Path(d, 'runs/2026-11-07').mkdir(parents=True)
    Path(d, 'runs/2026-11-07/picks.json').write_text('{broken')
    sh(*git, 'add', '.', cwd=d); sh(*git, 'commit', '-qm', 'c', cwd=d)
    assert other_branch_json('picks.json', '2026-11-06', cwd=d) == [{'thread': 'sky'}]

from manager import release_due, FAILED
from datetime import datetime, timezone
n = datetime(2026, 11, 5, 14, 50, tzinfo=timezone.utc)
m4 = {'runId': '2026-11-04', 'opensAt': '2026-11-04T13:00:00Z', 'nextOpensAt': '2026-11-05T13:00:00Z'}
m5 = {'runId': '2026-11-05', 'opensAt': '2026-11-05T13:00:00Z', 'nextOpensAt': '2026-11-06T13:00:00Z'}
assert release_due(m5, m4, n) == 'deploy'  # the 2026-11-05 morning: run on main, never deployed
assert release_due(m5, m4, datetime(2026, 11, 5, 12, 30, tzinfo=timezone.utc)) is None  # not open yet; m4 still playable
assert release_due(m4, m5, n) == 'older'
m7 = {'runId': '2026-11-07', 'opensAt': '2026-11-07T13:00:00Z', 'nextOpensAt': '2026-11-08T13:00:00Z'}
assert release_due(m7, m4, n) == 'expired'  # main skipped a day; live has closed
assert FAILED.search('Deploy failed verification: live run reads 2026-11-04, expected 2026-11-05.')
assert release_due(m4, m4, n) == 'expired'
assert release_due(m5, m5, n) is None
print('ok release')

import manager, json
calls = []
manager.sh = lambda *a, **k: type('R', (), {'stdout': 'abc123' if a[1] == 'rev-parse' else json.dumps(m5) if a[1] == 'show' else '', 'returncode': 0})()
manager.live_manifest = lambda: m4
manager.datetime = type('D', (), {'now': staticmethod(lambda tz: n), 'fromisoformat': staticmethod(datetime.fromisoformat)})
manager.deploy = lambda dry, rev=None: calls.append((dry, rev)) or 'Could deploy.'
manager.release(True)
assert calls == [(True, 'abc123')], calls  # dry stays dry, and the checked commit is the one deployed
manager.live_manifest = lambda: None
assert manager.release().startswith('Release check failed')  # null manifest is a recorded failure
manager.live_manifest = lambda: {**m4, 'opensAt': 5}
assert manager.release().startswith('Release check failed')  # non-string timestamp
print('ok release path')

# Checks run agent-written code: the sandbox blocks home-folder reads, network and writes outside the checkout.
if not os.environ.get('SWARMBREAK_SANDBOX'):
    from pr_team import sandboxed
    with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as secret, tempfile.TemporaryDirectory() as tree:
        Path(secret, 'token').write_text('x')
        assert sandboxed(['cat', f'{secret}/token'], tree).returncode
        assert sandboxed(['touch', f'{secret}/w'], tree).returncode
        assert sandboxed(['python3', '-c', 'import socket; socket.create_connection(("1.1.1.1", 443), 3)'], tree).returncode
        assert sandboxed(['sh', '-c', 'echo ok > out'], tree).returncode == 0
        # Checks run on a copy, so nothing they write reaches the tree that gets committed.
        assert not Path(tree, 'out').exists()
        # Host credentials and sockets are unavailable, even in shared temporary directories.
        import socket
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
    print('ok sandbox')
