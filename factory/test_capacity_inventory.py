"""The inventory reports evidence and never treats cleanliness as permission to remove."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import capacity_inventory as inv


class InventoryTest(unittest.TestCase):
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
