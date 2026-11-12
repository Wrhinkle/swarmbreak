"""Release dependency/build failures must expose capacity without deploying."""
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import manager


class ReleaseCapacityTest(unittest.TestCase):
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
