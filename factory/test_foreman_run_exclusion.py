import fcntl
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import foreman
import run


class ForemanRunExclusionTest(unittest.TestCase):
    def test_direct_run_first_stops_before_worktree_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / 'run.lock'
            with lock.open('a+') as held:
                fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(foreman, 'run_lock_path', return_value=lock), \
                     patch.object(foreman, 'sh') as git, patch.object(foreman, 'install') as install:
                    result = foreman.build_run('2026-11-12')
                self.assertEqual(result.returncode, run.RUN_BUSY)
                git.assert_not_called()
                install.assert_not_called()

    def test_foreman_first_excludes_direct_run_during_all_steps_and_releases(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'repo'
            tree = Path(temp) / 'swarmbreak-run-2026-11-12'
            (tree / 'factory' / '.venv').mkdir(parents=True)
            lock = Path(temp) / 'run.lock'
            steps = []
            def check(step):
                steps.append(step)
                with patch.object(run, 'run_lock_path', return_value=lock), patch.object(run, 'main') as main:
                    with self.assertRaises(SystemExit) as stopped:
                        run.locked_main('2026-11-12')
                    self.assertEqual(stopped.exception.code, run.RUN_BUSY)
                    main.assert_not_called()
            def git(*args, **kwargs):
                check('merge')
                return SimpleNamespace(returncode=0)
            def prepare(*args):
                check('checkout')
                return True
            real_run = subprocess.run
            def child(args, **kwargs):
                check('child')
                code = ("import os, sys; from pathlib import Path; import run; "
                        "run.run_lock_path = lambda _: Path(sys.argv[1]); "
                        "run.main = lambda: print('child acquired'); run.locked_main('2026-11-12')")
                result = real_run([sys.executable, '-c', code, str(lock)], cwd=Path(run.__file__).parent,
                                        capture_output=True, text=True, pass_fds=kwargs['pass_fds'], env=kwargs['env'])
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('child acquired', result.stdout)
                return SimpleNamespace(returncode=0, stdout='', stderr='')
            with patch.object(foreman, 'ROOT', root), patch.object(foreman, 'run_lock_path', return_value=lock), \
                 patch.object(foreman, 'sh', side_effect=git), patch.object(foreman, 'main_only', side_effect=prepare), \
                 patch.object(foreman, 'install', side_effect=lambda *_: check('install')), \
                 patch.object(foreman, 'run_problems', return_value=[]), patch.object(foreman, 'resume_stage', side_effect=['art', None]), \
                 patch.object(foreman, 'keep_run', side_effect=lambda *_: check('checkpoint')), \
                 patch.object(foreman, 'open_run', side_effect=lambda *_: (check('open') or 'Run is in PR')), \
                 patch.object(foreman.subprocess, 'run', side_effect=child):
                result = foreman.build_run('2026-11-12')
            self.assertEqual(result.returncode, 0)
            self.assertEqual(steps, ['merge', 'checkout', 'install', 'child', 'checkpoint', 'open'])
            with lock.open('a+') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_error_releases_foreman_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / 'run.lock'
            with patch.object(foreman, 'run_lock_path', return_value=lock), \
                 patch.object(foreman, '_build_run_locked', side_effect=RuntimeError('failed')):
                with self.assertRaisesRegex(RuntimeError, 'failed'):
                    foreman.build_run('2026-11-12')
            with lock.open('a+') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
