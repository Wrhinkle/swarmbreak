import unittest
from unittest.mock import patch

import manager


class ReleaseHandoffTest(unittest.TestCase):
    def test_open_then_merge_actual_pr(self):
        pr = {'number': 42, 'headRefName': 'run/2026-11-07', 'baseRefName': 'main'}
        calls = []
        with patch('manager.open_run', side_effect=lambda *args: calls.append(('open', args)) or 'Opened.'), \
             patch('manager.open_prs', side_effect=lambda: calls.append(('list',)) or [pr]), \
             patch('manager.act', wraps=manager.act) as act:
            # Avoid running the real PR team while exercising the recursive dispatch.
            original = act.side_effect
            def dispatch(action, state, dry):
                if action['type'] == 'merge_pr':
                    calls.append(('merge', action['pr']))
                    return 'PR team on 42 exited 0.'
                return original(action, state, dry) if original else manager_act(action, state, dry)
            manager_act = act._mock_wraps
            act.side_effect = dispatch
            result = act({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
        self.assertEqual(calls, [('open', ('2026-11-07', False)), ('list',), ('merge', 42)])
        self.assertIn('exited 0', result)

    def test_open_failure_stops_handoff(self):
        with patch('manager.open_run', return_value='Not opening: balance fails'), patch('manager.open_prs') as prs:
            result = manager.act({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
        self.assertIn('balance fails', result)
        prs.assert_not_called()

    def test_missing_or_ambiguous_pr_stops_handoff(self):
        pr = {'number': 42, 'headRefName': 'run/2026-11-07', 'baseRefName': 'main'}
        for matches in ([], [pr, pr]):
            with patch('manager.open_run', return_value='Opened.'), patch('manager.open_prs', return_value=matches):
                result = manager.act({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
            self.assertIn('Failed to find exactly one open PR', result)

class ScheduledHandoffTest(unittest.TestCase):
    def test_release_check_starts_built_run_handoff(self):
        with patch('manager.handoff_candidate', return_value=('2026-11-07', 'fingerprint')), \
             patch('manager.act', return_value='Opened and merged.') as action, \
             patch('manager.record'), patch('manager.handoff_fingerprint', return_value='fingerprint'):
            failures = []
            blocker = manager.handoff_step(failures, previous='')
        action.assert_called_once_with({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
        self.assertEqual(failures, [])
        self.assertEqual(blocker, '')

    def test_failed_handoff_waits_for_branch_or_main_change(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d, patch('manager.LOG', Path(d) / 'log'), \
             patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
             patch('manager.handoff_fingerprint', return_value='a'), \
             patch('manager.act', return_value='Handoff failed: review rejected') as action, patch('manager.record'):
            failures = []
            manager.handoff_step(failures)
            self.assertEqual(len(failures), 1)
            manager.handoff_step([])
            self.assertEqual(action.call_count, 1)
            with patch('manager.handoff_candidate', return_value=('2026-11-07', 'b')):
                manager.handoff_step([])
            self.assertEqual(action.call_count, 2)

    def test_candidate_uses_next_opening_and_existing_branch(self):
        from datetime import datetime, timezone
        from types import SimpleNamespace
        import json
        live = {'nextOpensAt': '2026-11-07T13:00:00Z'}
        main = {'opensAt': '2026-11-06T13:00:00Z'}
        def git(*args, **kwargs):
            if args[1] == 'show':
                return SimpleNamespace(stdout=json.dumps(main), returncode=0)
            return SimpleNamespace(stdout='abc', returncode=0)
        with patch('manager.sh', side_effect=git), patch('manager.live_manifest', return_value=live):
            self.assertIsNone(manager.handoff_candidate(datetime(2026, 11, 6, 18, 59, tzinfo=timezone.utc)))
            self.assertEqual(manager.handoff_candidate(datetime(2026, 11, 6, 19, tzinfo=timezone.utc))[0], '2026-11-07')
            main['opensAt'] = live['nextOpensAt']
            self.assertIsNone(manager.handoff_candidate(datetime(2026, 11, 7, 12, tzinfo=timezone.utc)))

    def test_scheduled_pass_hands_off_before_release_check(self):
        import os
        import sys
        import tempfile
        from pathlib import Path
        calls = []
        with tempfile.TemporaryDirectory() as d, patch('manager.LOG', Path(d) / 'log'), \
             patch.dict(os.environ), patch.object(sys, 'argv', ['manager.py', '--release-only']), \
             patch('manager.sync'), patch('manager.record'), patch('manager.follow_up'), \
             patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
             patch('manager.act', side_effect=lambda *a: calls.append('handoff') or 'PR team on 42 exited 0.'), \
             patch('manager.release', side_effect=lambda *a: calls.append('release') or ''):
            os.environ.pop('SWARMBREAK_LOCK_FD', None)
            manager.main()
        self.assertEqual(calls, ['handoff', 'release'])

    def test_followup_cannot_repeat_unchanged_handoff(self):
        import json
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d, patch('manager.LOG', Path(d) / 'log'), \
             patch('manager.handoff_fingerprint', return_value='a'), patch('manager.open_run') as opening:
            (Path(d) / '.handoff-failure.json').write_text(json.dumps({'id': '2026-11-07', 'fingerprint': 'a', 'result': 'review rejected'}))
            result = manager.act({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
            self.assertIn('unchanged handoff failure', result)
            opening.assert_not_called()


if __name__ == '__main__':
    unittest.main()
