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
    def test_builder_and_foreman_contend_in_both_orders(self):
        # Exercise the two real lock entry points in separate processes. The
        # protected bodies are replaced so the test never builds a real run.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            lock, ready, finish, wrote = (root / name for name in ('lock', 'ready', 'finish', 'wrote'))
            code = '''
import sys, time
from pathlib import Path
from types import SimpleNamespace
import run, foreman
lock, ready, finish, wrote = map(Path, sys.argv[2:])
run.run_lock_path = foreman.run_lock_path = lambda _: lock
def body(*args):
    wrote.write_text('entered')
    ready.touch()
    while not finish.exists(): time.sleep(.02)
    return SimpleNamespace(returncode=0)
if sys.argv[1] == 'run':
    run.main = body
    run.locked_main('2026-11-12')
else:
    foreman._build_run_locked = body
    sys.exit(foreman.build_run('2026-11-12').returncode)
'''
            env = {**os.environ, 'PYTHONPATH': str(Path(run.__file__).parent)}
            for first, second in (('run', 'foreman'), ('foreman', 'run')):
                with self.subTest(first=first):
                    for path in (ready, finish, wrote):
                        path.unlink(missing_ok=True)
                    args = [str(lock), str(ready), str(finish), str(wrote)]
                    holder = subprocess.Popen([sys.executable, '-c', code, first, *args], env=env)
                    try:
                        deadline = time.monotonic() + 10
                        while not ready.exists() and time.monotonic() < deadline:
                            time.sleep(.02)
                        self.assertTrue(ready.exists(), 'holder did not start')
                        wrote.unlink()
                        contender = subprocess.run([sys.executable, '-c', code, second, *args], env=env, timeout=10, capture_output=True)
                        self.assertEqual(contender.returncode, run.RUN_BUSY)
                        self.assertFalse(wrote.exists())
                        finish.touch()
                        self.assertEqual(holder.wait(timeout=10), 0)
                        later = subprocess.run([sys.executable, '-c', code, second, *args], env=env, timeout=10, capture_output=True)
                        self.assertEqual(later.returncode, 0)
                        self.assertTrue(wrote.exists())
                    finally:
                        if holder.poll() is None:
                            holder.kill()
                        holder.wait(timeout=10)

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

    def test_art_process_keeps_lock_after_builder_is_killed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            lock, ready, finish = root / 'run.lock', root / 'ready', root / 'finish'
            python = root / 'factory/.venv/bin/python'
            python.parent.mkdir(parents=True)
            python.write_text('#!' + sys.executable + "\nimport os, time\nfrom pathlib import Path\n"
                              "Path(os.environ['READY']).touch()\n"
                              "while not Path(os.environ['FINISH']).exists(): time.sleep(.02)\n")
            python.chmod(0o755)
            code = ("import run, sys; from pathlib import Path; "
                    "run.ROOT=Path(sys.argv[1]); run.run_lock_path=lambda _: Path(sys.argv[2]); "
                    "run.main=lambda: run.run_art('2026-11-12'); run.locked_main('2026-11-12')")
            env = {**os.environ, 'READY': str(ready), 'FINISH': str(finish),
                   'PYTHONPATH': str(Path(run.__file__).parent)}
            parent = subprocess.Popen([sys.executable, '-c', code, str(root), str(lock)], env=env, start_new_session=True)
            try:
                deadline = time.monotonic() + 10
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertTrue(ready.exists(), 'art process did not start')
                parent.kill()
                parent.wait(timeout=5)
                with lock.open('a+') as other:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    finish.touch()
                    deadline = time.monotonic() + 10
                    while True:
                        try:
                            fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            break
                        except BlockingIOError:
                            if time.monotonic() >= deadline:
                                self.fail('art process did not release the lock')
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
