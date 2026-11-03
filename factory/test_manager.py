#!/usr/bin/env python3
"""Run: python3 factory/test_manager.py. The gates on public posts and on what the manager can do."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from datetime import datetime, timezone
from manager import SITE, act, check_post, deploy_problems, post_problems, template_headings

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
print('ok')
