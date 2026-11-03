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
assert blocked_paths(['factory/agents/new-role.md'], 'z') == [] and blocked_paths(['factory/agents/comms.md'], 'z') and blocked_paths(['tools/sim.ts'], 'z')
assert blocked_paths(['src/act.ts', 'runs/2026-11-05/content.json'], '2026-11-04') == []
for path in ['AGENTS.md', 'factory/run.py', 'tools/balance.ts', 'tools/checks.ts', 'package.json', 'public/manifest.json', 'runs/2026-11-04/content.json']:
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
        assert gate_verdict(v)[0] is ok, text

# New agent prompts, saves and the verify scripts all count as limits; the log and ordinary source don't.
from pr_team import touches_gates
for path in ('factory/agents/brand-new.md', 'src/save.ts', 'package.json', 'tools/build-run.ts', 'factory/art.py'):
    assert touches_gates([{'path': path}]), path
for path in ('factory/log/notes.md', 'src/main.ts', 'runs/2026-11-05/content.json'):
    assert not touches_gates([{'path': path}]), path
