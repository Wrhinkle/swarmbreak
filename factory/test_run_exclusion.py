import fcntl
import os
import signal
import subprocess
import sys
import time
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
                    with self.assertRaises(SystemExit) as stopped:
                        run.locked_main('2026-11-12')
                    self.assertEqual(stopped.exception.code, run.RUN_BUSY)
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

    def test_tool_keeps_lock_after_builder_is_killed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            lock, ready, finish = root / 'run.lock', root / 'ready', root / 'finish'
            tool = root / 'npx'
            tool.write_text('#!' + sys.executable + "\nimport os, time\nfrom pathlib import Path\n"
                            "Path(os.environ['READY']).touch()\n"
                            "while not Path(os.environ['FINISH']).exists(): time.sleep(.02)\n")
            tool.chmod(0o755)
            code = ("import run, sys; from pathlib import Path; "
                    "run.run_lock_path=lambda _: Path(sys.argv[1]); "
                    "run.main=lambda: run.tool('test'); run.locked_main('2026-11-12')")
            env = {**os.environ, 'PATH': str(root) + os.pathsep + os.environ['PATH'],
                   'READY': str(ready), 'FINISH': str(finish), 'PYTHONPATH': str(Path(run.__file__).parent)}
            parent = subprocess.Popen([sys.executable, '-c', code, str(lock)], env=env, start_new_session=True)
            try:
                deadline = time.monotonic() + 10
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertTrue(ready.exists(), 'tool did not start')
                parent.kill()
                parent.wait(timeout=5)
                with lock.open('a+') as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finish.touch()
                deadline = time.monotonic() + 10
                with lock.open('a+') as other:
                    while True:
                        try:
                            fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            break
                        except BlockingIOError:
                            if time.monotonic() >= deadline:
                                self.fail('tool did not release the lock')
                            time.sleep(.02)
            finally:
                try:
                    os.killpg(parent.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                parent.wait(timeout=5)

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
