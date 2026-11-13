import fcntl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run


class RunExclusionTest(unittest.TestCase):
    def test_writer_refuses_an_active_writer_before_starting(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / '2026-11-12.lock'
            with lock.open('a+') as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(run, 'run_lock_path', return_value=lock), patch.object(run, 'main') as main:
                    with self.assertRaises(SystemExit):
                        run.locked_main('2026-11-12')
                    main.assert_not_called()

    def test_writer_holds_lock_until_main_returns(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / '2026-11-12.lock'
            def attempt():
                with lock.open('a+') as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(run, 'run_lock_path', return_value=lock), patch.object(run, 'main', side_effect=attempt):
                run.locked_main('2026-11-12')
            with lock.open('a+') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_writer_releases_lock_when_main_raises(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / '2026-11-12.lock'
            with patch.object(run, 'run_lock_path', return_value=lock), patch.object(run, 'main', side_effect=RuntimeError('stopped')):
                with self.assertRaisesRegex(RuntimeError, 'stopped'):
                    run.locked_main('2026-11-12')
            with lock.open('a+') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
