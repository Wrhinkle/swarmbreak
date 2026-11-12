"""Release dependency/build failures must expose capacity without deploying."""
import json
import errno
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

import manager


class ReleaseCapacityTest(unittest.TestCase):
    def test_capacity_blocker_stops_scheduled_retry_until_host_requests_it(self):
        prior = 'release -> Not deploying: release checkout failed: no space left on device; device 42, 0 bytes'
        with patch.object(manager, 'release', return_value='Deployed.') as release, \
             patch.object(manager, 'record'):
            failures = []
            self.assertEqual(manager.release_step(failures, previous=[prior]), prior)
            self.assertEqual(failures, [])
            release.assert_not_called()
            self.assertEqual(manager.release_step(failures, previous=[prior], retry_capacity=True), '')
            release.assert_called_once_with(False)

    def test_scheduled_pass_keeps_capacity_blocker_until_explicit_retry(self):
        prior = 'release -> Not deploying: release fetch failed: no space left on device; unknown filesystem'
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(manager, 'LOG', Path(directory) / 'decisions.jsonl'), \
             patch.object(manager, 'sync', side_effect=SystemExit('fetch failed')) as sync, patch.object(manager, 'record'), \
             patch.object(manager, 'follow_up'), \
             patch.object(manager, 'release', return_value='Deployed.') as release, \
             patch.dict(os.environ):
            os.environ.pop('SWARMBREAK_LOCK_FD', None)
            lock = Path(directory) / '.lock'
            lock.write_text(prior)
            output = io.StringIO()
            with patch.object(sys, 'argv', ['manager.py', '--release-only']), redirect_stdout(output):
                manager.main()
            self.assertIn('capacity recovery required', output.getvalue())
            self.assertIn(prior, output.getvalue())
            sync.assert_not_called()
            release.assert_not_called()
            self.assertEqual(lock.read_text(), prior)
            sync.side_effect = None
            os.environ.pop('SWARMBREAK_LOCK_FD', None)
            with patch.object(sys, 'argv', ['manager.py', '--release-only', '--retry-capacity']):
                manager.main()
            sync.assert_called_once_with()
            release.assert_called_once_with(False)
            self.assertEqual(lock.read_text(), '')
            os.environ.pop('SWARMBREAK_LOCK_FD', None)
            with patch.object(sys, 'argv', ['manager.py', '--release-only']):
                manager.main()
            self.assertEqual(sync.call_count, 2)
            self.assertEqual(release.call_count, 2)

    def test_release_check_no_space_after_fetch_is_a_blocker(self):
        for error in (OSError(errno.ENOSPC, 'disk full'), SystemExit('No space left on device')):
            with self.subTest(error=error), \
                 patch.object(manager, 'sh', side_effect=[SimpleNamespace(stdout=''), error]) as command, \
                 patch.object(manager, 'capacity_detail', return_value='repository (device 42): 0 bytes available of 1000'), \
                 patch.object(manager, 'deploy') as deploy:
                result = manager.release()
            self.assertIn('release check failed: no space left on device', result)
            self.assertIn('failing filesystem: unknown', result)
            self.assertIn('device 42', result)
            self.assertTrue(manager.persistent_release_blocker(result))
            self.assertEqual(manager.release_blocker_identity('release -> ' + result),
                             'release -> Not deploying: release check failed: no space left on device;')
            self.assertEqual(command.call_count, 2)
            deploy.assert_not_called()

    def test_fetch_no_space_reports_capacity_and_stops_before_release(self):
        with patch.object(manager, 'sh', side_effect=SystemExit('git fetch: No space left on device')) as command, \
             patch.object(manager, 'capacity_detail', return_value='repository (device 42): 0 bytes available of 1000'), \
             patch.object(manager, 'deploy') as deploy:
            result = manager.release()
        self.assertIn('release fetch failed: no space left on device', result)
        self.assertIn('device 42', result)
        self.assertTrue(manager.persistent_release_blocker(result))
        self.assertEqual(manager.release_blocker_identity('release -> ' + result),
                         'release -> Not deploying: release fetch failed: no space left on device;')
        command.assert_called_once_with('git', 'fetch', 'origin')
        deploy.assert_not_called()

    def test_fetch_other_failure_remains_a_release_check_failure(self):
        with patch.object(manager, 'sh', side_effect=SystemExit('git fetch: permission denied')), \
             patch.object(manager, 'capacity_detail') as capacity:
            result = manager.release()
        self.assertEqual(result, 'Release check failed: git fetch: permission denied')
        capacity.assert_not_called()

    def test_temporary_directory_no_space_is_a_capacity_blocker(self):
        with patch.object(manager.tempfile, 'TemporaryDirectory', side_effect=OSError(28, 'No space left on device')), \
             patch.object(manager.tempfile, 'gettempdir', side_effect=['/tmp', FileNotFoundError('second lookup failed')]) as lookup, \
             patch.object(manager, 'capacity_detail', return_value='/tmp (device 42): 0 bytes available of 1000'), \
             patch.object(manager, 'sh') as command:
            result = manager.deploy(False, 'revision')
        self.assertIn('release checkout failed: no space left on device', result)
        self.assertIn('device 42', result)
        self.assertTrue(manager.persistent_release_blocker(result))
        lookup.assert_called_once_with()
        command.assert_not_called()

    def test_temporary_directory_other_errors_are_not_capacity_blockers(self):
        with patch.object(manager.tempfile, 'TemporaryDirectory', side_effect=OSError(13, 'Permission denied')):
            with self.assertRaises(OSError):
                manager.deploy(False, 'revision')

    def test_uncached_tempdir_probes_report_actual_no_space(self):
        original_lookup = manager.tempfile.gettempdir
        with patch.object(manager.tempfile, 'tempdir', None), \
             patch.object(manager.tempfile, '_candidate_tempdir_list', return_value=['/full']), \
             patch.object(manager.tempfile._os, 'open', side_effect=OSError(errno.ENOSPC, 'No space left on device')), \
             patch.object(manager.tempfile, 'gettempdir', wraps=original_lookup) as lookup, \
             patch.object(manager, 'capacity_detail', return_value='/full (device 42): 0 bytes available of 1000'), \
             patch.object(manager, 'sh') as command:
            result = manager.deploy(False, 'revision')
        self.assertTrue(manager.persistent_release_blocker(result))
        self.assertIn('/full (device 42)', result)
        lookup.assert_called_once_with()
        command.assert_not_called()

    def test_failed_tempdir_lookup_without_capacity_evidence_is_not_misclassified(self):
        for probe_error in (FileNotFoundError(errno.ENOENT, 'missing'), PermissionError(errno.EACCES, 'denied')):
            with self.subTest(error=probe_error), \
                 patch.object(manager.tempfile, 'gettempdir', side_effect=FileNotFoundError(errno.ENOENT, 'no usable directory')) as lookup, \
                 patch.object(manager.tempfile, '_candidate_tempdir_list', return_value=['/bad']), \
                 patch.object(manager.tempfile, 'mkstemp', side_effect=probe_error), \
                 patch.object(manager, 'sh') as command:
                with self.assertRaises(FileNotFoundError):
                    manager.deploy(False, 'revision')
                lookup.assert_called_once_with()
                command.assert_not_called()

    def test_npm_no_space_is_a_capacity_blocker(self):
        manifest = {'runId': 'x', 'runUrl': '/runs/x/run.json'}
        for failed in [('npm', 'ci'), ('npm', 'run', 'build'), ('npm', 'test')]:
            commands = []
            def command(*args, **kwargs):
                commands.append(args)
                if args[:3] == ('git', 'worktree', 'add'):
                    tree = Path(args[4])
                    (tree / 'public/runs/x').mkdir(parents=True)
                    (tree / 'public/manifest.json').write_text(json.dumps(manifest))
                    (tree / 'public/runs/x/run.json').write_text('{}')
                return SimpleNamespace(returncode=int(args == failed), stdout='',
                                       stderr='No space left on device' if args == failed else '')
            with self.subTest(failed=failed), patch.object(manager, 'sh', side_effect=command), \
                 patch.object(manager, 'live_manifest', return_value=manifest), \
                 patch.object(manager, 'effective', side_effect=lambda value, now: value), \
                 patch.object(manager, 'deploy_problems', return_value=[]), \
                 patch.object(manager.shutil, 'disk_usage', return_value=SimpleNamespace(total=1000, free=12)), \
                 patch.object(manager.os, 'stat', return_value=SimpleNamespace(st_dev=42)):
                result = manager.deploy(False, 'revision')
            self.assertIn('12 bytes available of 1000', result)
            self.assertIn(' '.join(failed), result)
            self.assertTrue(manager.persistent_release_blocker(result))
            self.assertFalse(any(cmd[0] == 'firebase' for cmd in commands))
            self.assertEqual(sum(cmd == failed for cmd in commands), 1)

    def test_checkout_revision_no_space_is_a_capacity_blocker(self):
        manifest = {'runId': 'x', 'runUrl': '/runs/x/run.json'}
        commands = []
        def command(*args, **kwargs):
            commands.append(args)
            if args[:3] == ('git', 'worktree', 'add'):
                tree = Path(args[4])
                (tree / 'public/runs/x').mkdir(parents=True)
                (tree / 'public/manifest.json').write_text(json.dumps(manifest))
                (tree / 'public/runs/x/run.json').write_text('{}')
            if args == ('git', 'rev-parse', 'HEAD'):
                raise SystemExit('git rev-parse: No space left on device')
            return SimpleNamespace(returncode=0, stdout='', stderr='')
        with patch.object(manager, 'release_check', return_value=('', 'revision')), \
             patch.object(manager, 'sh', side_effect=command), \
             patch.object(manager, 'live_manifest', return_value=manifest), \
             patch.object(manager, 'effective', side_effect=lambda value, now: value), \
             patch.object(manager, 'deploy_problems', return_value=[]), \
             patch.object(manager, 'capacity_detail', return_value='checkout (device 42): 0 bytes available of 1000'):
            result = manager.release()
        self.assertIn('release checkout revision failed: no space left on device', result)
        self.assertIn('device 42', result)
        self.assertTrue(manager.persistent_release_blocker(result))
        self.assertTrue(manager.is_capacity_blocker('release -> ' + result))
        self.assertFalse(any(cmd[0] == 'firebase' for cmd in commands))

    def test_revision_file_no_space_stops_release_with_capacity_evidence(self):
        manifest = {'runId': 'x', 'runUrl': '/runs/x/run.json'}
        commands = []
        original_write = Path.write_text
        def command(*args, **kwargs):
            commands.append(args)
            if args[:3] == ('git', 'worktree', 'add'):
                tree = Path(args[4])
                (tree / 'public/runs/x').mkdir(parents=True)
                (tree / 'public/manifest.json').write_text(json.dumps(manifest))
                (tree / 'public/runs/x/run.json').write_text('{}')
            if args == ('git', 'rev-parse', 'HEAD'):
                return SimpleNamespace(returncode=0, stdout='a' * 40, stderr='')
            return SimpleNamespace(returncode=0, stdout='', stderr='')
        def write(path, *args, **kwargs):
            if path.name == 'deployed-revision.txt':
                raise OSError(28, 'No space left on device')
            return original_write(path, *args, **kwargs)
        with patch.object(manager, 'sh', side_effect=command), \
             patch.object(manager, 'live_manifest', return_value=manifest), \
             patch.object(manager, 'effective', side_effect=lambda value, now: value), \
             patch.object(manager, 'deploy_problems', return_value=[]), \
             patch.object(manager.shutil, 'disk_usage', return_value=SimpleNamespace(total=1000, free=12)), \
             patch.object(Path, 'write_text', write):
            result = manager.deploy(False, 'revision')
        self.assertIn('release revision file failed: no space left on device', result)
        self.assertIn('12 bytes available', result)
        self.assertTrue(manager.persistent_release_blocker(result))
        self.assertFalse(any(cmd[0] == 'firebase' for cmd in commands))

    def test_revision_capacity_preserves_cleanup_failures(self):
        manifest = {'runId': 'x', 'runUrl': '/runs/x/run.json'}
        original_write = Path.write_text
        for failure in ('removal status', 'removal exception', 'temporary cleanup exception'):
            commands = []
            def command(*args, **kwargs):
                commands.append(args)
                if args[:3] == ('git', 'worktree', 'add'):
                    tree = Path(args[4])
                    (tree / 'public/runs/x').mkdir(parents=True)
                    (tree / 'public/manifest.json').write_text(json.dumps(manifest))
                    (tree / 'public/runs/x/run.json').write_text('{}')
                if args[:3] == ('git', 'worktree', 'remove'):
                    if failure == 'removal exception':
                        raise OSError('removal error')
                    if failure == 'removal status':
                        return SimpleNamespace(returncode=1, stdout='', stderr='removal error')
                if args == ('git', 'rev-parse', 'HEAD'):
                    return SimpleNamespace(returncode=0, stdout='a' * 40, stderr='')
                return SimpleNamespace(returncode=0, stdout='', stderr='')
            def write(path, *args, **kwargs):
                if path.name == 'deployed-revision.txt':
                    raise OSError(28, 'No space left on device')
                return original_write(path, *args, **kwargs)
            original_cleanup = manager.tempfile.TemporaryDirectory.cleanup
            def cleanup(temp):
                original_cleanup(temp)
                if failure == 'temporary cleanup exception':
                    raise OSError('cleanup error')
            with self.subTest(failure=failure), patch.object(manager, 'sh', side_effect=command), \
                 patch.object(manager, 'live_manifest', return_value=manifest), \
                 patch.object(manager, 'effective', side_effect=lambda value, now: value), \
                 patch.object(manager, 'deploy_problems', return_value=[]), \
                 patch.object(Path, 'write_text', write), \
                 patch.object(manager.tempfile.TemporaryDirectory, 'cleanup', cleanup):
                result = manager.deploy(False, 'revision')
            self.assertTrue(manager.persistent_release_blocker(result))
            self.assertIn('release revision file failed: no space left on device', result)
            self.assertIn('cleanup error' if failure == 'temporary cleanup exception' else 'removal error', result)
            self.assertFalse(any(cmd[0] == 'firebase' for cmd in commands))

    def test_cache_device_and_unknown_source_after_cleanup(self):
        manifest = {'runId': 'x', 'runUrl': '/runs/x/run.json'}
        for reported in (True, False):
            removed = False
            def command(*args, **kwargs):
                nonlocal removed
                if args[:3] == ('git', 'worktree', 'add'):
                    tree = Path(args[4])
                    (tree / 'public/runs/x').mkdir(parents=True)
                    (tree / 'public/manifest.json').write_text(json.dumps(manifest))
                    (tree / 'public/runs/x/run.json').write_text('{}')
                if args[:3] == ('git', 'worktree', 'remove'):
                    removed = True
                if args == ('npm', 'config', 'get', 'cache'):
                    return SimpleNamespace(returncode=0, stdout='/cache', stderr='')
                if args == ('npm', 'ci'):
                    path = 'npm error path /cache\n' if reported else ''
                    return SimpleNamespace(returncode=1, stdout='', stderr=path + 'No space left on device')
                return SimpleNamespace(returncode=0, stdout='', stderr='')
            def stat(path):
                return SimpleNamespace(st_dev=99 if str(path) == '/cache' else 42)
            def usage(path):
                return SimpleNamespace(total=1000, free=80 if removed else 12)
            with self.subTest(reported=reported), patch.object(manager, 'sh', side_effect=command), \
                 patch.object(manager, 'live_manifest', return_value=manifest), \
                 patch.object(manager, 'effective', side_effect=lambda value, now: value), \
                 patch.object(manager, 'deploy_problems', return_value=[]), \
                 patch.object(manager.os, 'stat', side_effect=stat), \
                 patch.object(manager.shutil, 'disk_usage', side_effect=usage):
                result = manager.deploy(False, 'revision')
            self.assertIn('npm cache candidate at failure: /cache (device 99): 12 bytes', result)
            self.assertIn('checkout parent after cleanup:', result)
            self.assertIn('80 bytes available', result)
            self.assertIn('npm-reported path: /cache (device 99)' if reported else 'failing filesystem: unknown', result)
            self.assertIn('No space left on device', result)


if __name__ == '__main__':
    unittest.main()
