import unittest
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import manager

real_run_already_merged = manager.run_already_merged


class MarkerTestCase(unittest.TestCase):
    def setUp(self):
        merged_patch = patch.object(manager, 'run_already_merged', return_value=False)
        merged_patch.start()
        self.addCleanup(merged_patch.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.marker = Path(self.tmp.name) / 'marker.json'
        self.legacy = Path(self.tmp.name) / 'log' / '.handoff-failure.json'
        self.legacy.parent.mkdir()
        for name, value in [('handoff_marker_path', self.marker), ('LOG', self.legacy.parent / 'decisions.jsonl')]:
            patcher = patch.object(manager, name, return_value=value) if name == 'handoff_marker_path' else patch.object(manager, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)


class ReleaseHandoffTest(MarkerTestCase):
    def test_merged_retry_and_changed_branch(self):
        run_id = '2026-11-07'
        head, commit = 'a' * 40, 'b' * 40
        pr = {'headRefName': f'run/{run_id}', 'baseRefName': 'main',
              'headRefOid': head, 'mergeCommit': {'oid': commit}}
        current_head = [head]
        def git(*args, **kwargs):
            if args[1] == 'rev-parse':
                return SimpleNamespace(returncode=0, stdout=current_head[0])
            if args[1] == 'show':
                return SimpleNamespace(returncode=0, stdout=json.dumps({'runId': run_id}))
            return SimpleNamespace(returncode=0, stdout='')
        with patch('manager.sh', side_effect=git), patch('manager.gh', return_value=[pr]), \
             patch('manager.run_already_merged', side_effect=real_run_already_merged), \
             patch('manager.open_run', return_value='Not opening: test') as opening:
            self.assertIn('already merged', manager.act({'type': 'open_and_merge', 'id': run_id}, {}, False))
            opening.assert_not_called()
            current_head[0] = 'c' * 40
            self.assertIn('Not opening', manager.act({'type': 'open_and_merge', 'id': run_id}, {}, False))
            opening.assert_called_once()

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

class ScheduledHandoffTest(MarkerTestCase):
    def test_exception_during_handoff_blocks_unchanged_retry(self):
        with patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
             patch('manager.handoff_fingerprint', return_value='a'), \
             patch('manager.act', side_effect=SystemExit('git push failed')) as action, patch('manager.record'):
            failures = []
            manager.handoff_step(failures)
            manager.handoff_step([])
        self.assertEqual(action.call_count, 1)
        self.assertIn('git push failed', failures[0])
        self.assertEqual(json.loads(self.marker.read_text())['fingerprint'], 'a')

    def test_release_check_starts_built_run_handoff(self):
        with patch('manager.handoff_candidate', return_value=('2026-11-07', 'fingerprint')), \
             patch('manager.act', return_value='Opened and merged.') as action, \
             patch('manager.record'), patch('manager.handoff_fingerprint', return_value='fingerprint'):
            failures = []
            blocker = manager.handoff_step(failures, previous={})
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

    def test_long_timeout_output_retains_full_head(self):
        head = 'abcdef0' + '1' * 33
        pr = {'number': 42, 'headRefName': 'run/2026-11-07', 'baseRefName': 'main', 'headRefOid': head, 'url': 'pr-url'}
        result = ('Handoff failed: ' + 'opening ' * 100 + ' PR team on 42 exited 1. Last output: '
                  + 'x' * 700 + " Qodo hasn't reviewed abcdef0 after 25 minutes. Not merging.")
        with patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
             patch('manager.handoff_fingerprint', return_value='a'), patch('manager.open_prs', return_value=[pr]), \
             patch('manager.findings', return_value={'review_session': {'commit_sha': head, 'review_complete': True}}), \
             patch('manager.act', return_value=result), patch('manager.record'):
            manager.handoff_step([])
            marker = json.loads(self.marker.read_text())
            self.assertNotIn('PR team on 42 exited', marker['result'])
            self.assertEqual(marker['timeout'], {'pr': 42, 'head': head})
            self.assertEqual(manager.handoff_blocked('2026-11-07', 'a', marker), '')
            pr['headRefOid'] = 'abcdef0' + '2' * 33
            self.assertIn('unchanged handoff failure', manager.handoff_blocked('2026-11-07', 'a', marker))

    def test_review_timeout_only_retries_for_completed_exact_head(self):
        result = "Handoff failed: PR team on 42 exited 1. Last output: Qodo hasn't reviewed abcdef0 after 25 minutes. Not merging."
        self.marker.write_text(json.dumps({'id': '2026-11-07', 'fingerprint': 'a', 'result': result}))
        pr = {'number': 42, 'headRefName': 'run/2026-11-07', 'baseRefName': 'main', 'headRefOid': 'abcdef012345', 'url': 'pr-url'}
        with patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
             patch('manager.handoff_fingerprint', return_value='a'), patch('manager.open_prs', return_value=[pr]), \
             patch('manager.findings') as findings, patch('manager.open_run', return_value='Not opening: test') as opening, \
             patch('manager.record'):
            for session in ({'commit_sha': pr['headRefOid'], 'review_complete': False},
                            {'commit_sha': 'abcdef099999', 'review_complete': True}):
                findings.return_value = {'review_session': session}
                manager.handoff_step([])
                for kind in ('open_run', 'open_and_merge'):
                    self.assertIn('unchanged handoff failure', manager.act({'type': kind, 'id': '2026-11-07'}, {}, False))
            opening.assert_not_called()
            findings.return_value = {'review_session': {'commit_sha': pr['headRefOid'], 'review_complete': True}}
            for kind in ('open_run', 'open_and_merge'):
                manager.act({'type': kind, 'id': '2026-11-07'}, {}, False)
            self.assertEqual(opening.call_count, 2)
            manager.handoff_step([])
            self.assertEqual(opening.call_count, 3)

    def test_damaged_marker_blocks_both_callers_without_followup(self):
        for content in ('{', '[]', '{}', '{"id": 4}'):
            self.marker.write_text(content)
            with patch('manager.handoff_candidate', return_value=('2026-11-07', 'a')), \
                 patch('manager.open_run') as opening, patch('manager.record'):
                failures = []
                manager.handoff_step(failures)
                manager.handoff_step(failures)
                for kind in ('open_run', 'open_and_merge'):
                    self.assertIn('damaged handoff marker', manager.act({'type': kind, 'id': '2026-11-07'}, {}, False))
                self.assertEqual(failures, [])
                opening.assert_not_called()

    def test_atomic_write_preserves_previous_marker_on_interruption(self):
        self.marker.write_text('old')
        with patch('manager.os.replace', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):
                manager.write_handoff_marker(self.marker, 'new')
        self.assertEqual(self.marker.read_text(), 'old')
        self.assertEqual(list(self.marker.parent.glob('tmp*')), [])

    def test_legacy_marker_survives_keep_run_and_is_excluded(self):
        data = {'id': '2026-11-07', 'fingerprint': 'a', 'result': 'review rejected'}
        self.legacy.write_text(json.dumps(data))
        commands = []
        def git(*args, **kwargs):
            commands.append(args)
            return SimpleNamespace(stdout='run/2026-11-08', returncode=0)
        with patch('manager.sh', side_effect=git), patch('manager.switch_keeping_log', return_value=SimpleNamespace(returncode=0)):
            manager.keep_run('2026-11-08', 'checkpoint')
        self.assertTrue(any(':(exclude)factory/log/.handoff-failure.json' in c for c in commands if c[:2] == ('git', 'add')))
        self.legacy.unlink()  # Branch switch removes the old branch-local file.
        self.assertEqual(manager.read_handoff_marker(), data)
        self.assertIn('unchanged handoff failure', manager.handoff_blocked('2026-11-07', 'a'))

    def test_reviewed_handoff_retry_keeps_head_until_run_or_manifest_changes(self):
        run_id = '2026-11-07'
        root = Path(self.tmp.name)
        run = root / 'runs' / run_id / 'run.json'
        manifest = root / 'public' / 'manifest.json'
        log = root / 'factory' / 'log' / 'decisions.jsonl'
        for path in (run, manifest, log):
            path.parent.mkdir(parents=True, exist_ok=True)
        run.write_text('run one')
        manifest.write_text(json.dumps({'voided': []}))
        log.write_text('initial log\n')
        branch, head, committed, staged = ['main'], ['0' * 40], {}, {}
        review = {'commit_sha': '', 'review_complete': False}

        def snapshot(paths):
            result = {}
            for name in paths:
                if name.startswith(':'):
                    continue
                path = root / name
                for file in ([path] if path.is_file() else path.rglob('*')):
                    if file.is_file() and file.name != '.handoff-failure.json':
                        result[str(file.relative_to(root))] = file.read_bytes()
            return result

        def git(*args, **kwargs):
            cmd = args[1:]
            if cmd[:2] == ('branch', '--show-current'):
                return SimpleNamespace(stdout=branch[0], returncode=0)
            if cmd[0] == 'add':
                staged.update(snapshot(cmd[1:]))
            if cmd[:3] == ('diff', '--cached', '--quiet'):
                selected = snapshot(cmd[4:])
                changed = any(staged.get(k) != committed.get(k) for k in selected)
                return SimpleNamespace(stdout='', returncode=int(changed))
            if cmd[0] == 'commit':
                committed.update(staged)
                staged.clear()
                head[0] = f'{int(head[0], 16) + 1:040x}'
            return SimpleNamespace(stdout='', stderr='', returncode=0)

        def switch(target):
            branch[0] = target
            return SimpleNamespace(returncode=0, stderr='')

        def prs():
            return [{'number': 42, 'headRefName': f'run/{run_id}', 'baseRefName': 'main',
                     'headRefOid': head[0], 'url': 'pr-url'}]

        def dispatch(action, state, dry):
            if action['type'] == 'merge_pr':
                if review['review_complete'] and review['commit_sha'] == head[0]:
                    return 'PR team on 42 exited 0.'
                return f"PR team on 42 exited 1. Qodo hasn't reviewed {head[0][:7]} after 25 minutes. Not merging."
            return real_act(action, state, dry)

        def record(entry):
            with log.open('a') as out:
                out.write(json.dumps(entry) + '\n')

        real_act = manager.act
        with patch('manager.ROOT', root), patch('manager.LOG', log), patch('manager.sh', side_effect=git), \
             patch('manager.switch_keeping_log', side_effect=switch), patch('manager.run_problems', return_value=[]), \
             patch('manager.gh', return_value=[{'number': 42}]), patch('manager.open_prs', side_effect=prs), \
             patch('manager.findings', side_effect=lambda url: {'review_session': review}), \
             patch('manager.handoff_candidate', return_value=(run_id, 'fingerprint')), \
             patch('manager.handoff_fingerprint', return_value='fingerprint'), patch('manager.record', side_effect=record), \
             patch('manager.act', side_effect=dispatch):
            failures = []
            manager.handoff_step(failures)
            self.assertEqual(len(failures), 1)
            reviewed_head = head[0]
            self.assertIn('Handoff failed', log.read_text())
            review.update(commit_sha=reviewed_head, review_complete=True)
            manager.handoff_step([])
            self.assertEqual(head[0], reviewed_head)
            self.assertIn('exited 0', log.read_text())
            for changed in ('run', 'manifest'):
                if changed == 'run':
                    run.write_text('run two')
                else:
                    manifest.write_text(json.dumps({'voided': ['old']}))
                result = manager.act({'type': 'open_and_merge', 'id': run_id}, {}, False)
                self.assertNotEqual(head[0], reviewed_head)
                self.assertIn("Qodo hasn't reviewed", result)
                reviewed_head = head[0]
                review['commit_sha'] = reviewed_head

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
            self.marker.write_text(json.dumps({'id': '2026-11-07', 'fingerprint': 'a', 'result': 'review rejected'}))
            result = manager.act({'type': 'open_and_merge', 'id': '2026-11-07'}, {}, False)
            self.assertIn('unchanged handoff failure', result)
            opening.assert_not_called()


if __name__ == '__main__':
    unittest.main()
