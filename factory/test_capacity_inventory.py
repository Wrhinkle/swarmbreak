"""The inventory reports evidence and never treats cleanliness as permission to remove."""
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import capacity_inventory as inv


class InventoryTest(unittest.TestCase):
    def test_inventory_explains_observed_retention_reasons(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            record = [f'worktree {path}'.encode(), b'HEAD abc', b'locked in use']
            with patch.object(inv, 'command', side_effect=[
                subprocess.CompletedProcess([], 0, b' M tracked\0?? new\0!! cache/\0'),
                subprocess.CompletedProcess([], 0, b'12\tpath\n')
            ]):
                result = inv.inventory(path, record)
            self.assertEqual(result['retention_reasons'], [
                'worktree is locked', 'tracked changes', 'untracked files', 'ignored files',
                'ownership, activity, job state and saved work not verified'])
            self.assertIn('retain', result['removal_eligibility'])

    def test_failed_status_scan_is_explicitly_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            with patch.object(inv, 'command', side_effect=[
                OSError(28, 'No space left on device'),
                subprocess.CompletedProcess([], 0, b'12\tpath\n')
            ]):
                result = inv.inventory(path, [f'worktree {path}'.encode()])
            self.assertIn('status unavailable', result['retention_reasons'])
            self.assertFalse(result['complete'])

    def test_filesystem_report_survives_progress_stream_failure(self):
        class FailingStream:
            def __init__(self, fail_on):
                self.fail_on = fail_on
                self.calls = 0

            def write(self, text):
                self.calls += 1
                if self.fail_on == 'write':
                    raise OSError(28, 'No space left on device')

            def flush(self):
                if self.fail_on == 'flush':
                    raise OSError(28, 'No space left on device')

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            record = f'worktree {path}\0HEAD abc'.encode()
            for failure in ('write', 'flush'):
                with self.subTest(failure=failure):
                    stderr, stdout = FailingStream(failure), io.StringIO()
                    with patch.object(inv.sys, 'argv', ['capacity_inventory.py', '--filesystem', str(path)]), \
                         patch.object(inv.sys, 'stderr', stderr), patch.object(inv.sys, 'stdout', stdout), \
                         patch.object(inv, 'worktree_records', return_value=[record]), \
                         patch.object(inv, 'inventory', return_value={'path': str(path)}) as inspect:
                        inv.main()
                    inspect.assert_called_once()
                    self.assertEqual(json.loads(stdout.getvalue())['worktrees'], [{'path': str(path)}])
                    # print may call write separately for the message and newline.
                    self.assertEqual(stderr.calls, 1 if failure == 'write' else 2)

    def test_registered_clean_dirty_and_ignored_are_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            record = f'worktree {path}\0HEAD abc\0branch refs/heads/fix/issue-7\0\0'.encode()
            for status in (b'', b' M tracked\0?? new\0', b'!! cache/\0'):
                with self.subTest(status=status), patch.object(inv, 'command', side_effect=[
                    subprocess.CompletedProcess([], 0, record),
                    subprocess.CompletedProcess([], 0, status),
                    subprocess.CompletedProcess([], 0, b'12\t' + str(path).encode() + b'\n')
                ]) as run:
                    result = inv.inventory(path)
                    self.assertEqual(result['allocated_kib_estimate'], 12)
                    self.assertEqual(result['status_entries'],
                                     [entry.decode() for entry in status.split(b'\0') if entry])
                    self.assertIn('unknown', result['removal_eligibility'])
                    self.assertEqual(run.call_count, 3)
                    self.assertEqual(run.call_args_list[1].args,
                                     ('git', '--no-optional-locks', '-C', str(path), 'status',
                                      '--porcelain=v1', '-z', '--untracked-files=all',
                                      '--ignored=matching'))

    def test_filesystem_inventory_reports_matching_and_uninspectable_worktrees(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            missing = path / 'missing'
            records = [f'worktree {path}\0HEAD abc'.encode(),
                       f'worktree {missing}\0HEAD def'.encode()]
            with patch.object(inv, 'worktree_records', return_value=records), \
                 patch.object(inv, 'inventory', return_value={'path': str(path),
                              'removal_eligibility': 'unknown: retain'}) as inspect:
                result = inv.filesystem_inventory(path)
            self.assertEqual(result['device'], path.stat().st_dev)
            self.assertEqual(len(result['worktrees']), 2)
            inspect.assert_called_once_with(str(path), records[0].split(b'\0'))
            self.assertEqual(result['worktrees'][1]['path'], str(missing))
            self.assertIn('error', result['worktrees'][1])
            self.assertIn('retain', result['worktrees'][1]['removal_eligibility'])

    def test_missing_worktree_reports_retention_reasons_in_report_and_progress(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            missing = path / 'missing'
            record = f'worktree {missing}\0HEAD abc\0locked in use\0prunable missing'.encode()
            progress = []
            with patch.object(inv, 'worktree_records', return_value=[record]):
                result = inv.filesystem_inventory(path, progress.append)
            item = result['worktrees'][0]
            self.assertEqual(item['retention_reasons'], [
                'worktree is locked', 'worktree is prunable or inaccessible',
                'ownership, activity, job state and saved work not verified'])
            self.assertIn('error', item)
            self.assertFalse(item['complete'])
            self.assertIn('retain', item['removal_eligibility'])
            self.assertEqual(progress[1], {'type': 'worktree', **item})

    def test_slow_scan_reports_progress_and_continues_to_other_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            slow, fast = root / 'slow', root / 'fast'
            slow.mkdir()
            fast.mkdir()
            records = [f'worktree {tree}\0HEAD abc'.encode() for tree in (slow, fast)]
            progress = []

            def scan(*args, timeout=None):
                self.assertEqual(timeout, inv.SCAN_TIMEOUT_SECONDS)
                if args[0] == 'git' and str(slow) in args:
                    raise subprocess.TimeoutExpired(args, timeout)
                return subprocess.CompletedProcess(args, 0, b'8\tpath\n' if args[0] == 'du' else b'')

            with patch.object(inv, 'worktree_records', return_value=records) as listing, \
                 patch.object(inv, 'command', side_effect=scan):
                result = inv.filesystem_inventory(root, progress.append)
            listing.assert_called_once_with()
            self.assertEqual([entry['type'] for entry in progress],
                             ['filesystem', 'worktree', 'worktree'])
            self.assertFalse(result['worktrees'][0]['complete'])
            self.assertIsNone(result['worktrees'][0]['status_entries'])
            self.assertIn('status', result['worktrees'][0]['scan_errors'])
            self.assertIn('retain', result['worktrees'][0]['removal_eligibility'])
            self.assertEqual(result['worktrees'][0]['allocated_kib_estimate'], 8)
            self.assertTrue(result['worktrees'][1]['complete'])
            self.assertEqual(progress[2]['path'], str(fast))

    def test_filesystem_inventory_stops_when_listing_fails(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(inv, 'worktree_records', side_effect=OSError(28, 'No space left on device')):
            with self.assertRaises(OSError):
                inv.filesystem_inventory(directory)

    def test_unregistered_and_command_failure_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(inv, 'command', return_value=subprocess.CompletedProcess([], 0, b'')):
                with self.assertRaises(ValueError):
                    inv.inventory(directory)
            with patch.object(inv, 'command', side_effect=OSError(28, 'No space left on device')):
                with self.assertRaises(OSError):
                    inv.inventory(directory)


if __name__ == '__main__':
    unittest.main()
