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


if __name__ == '__main__':
    unittest.main()
