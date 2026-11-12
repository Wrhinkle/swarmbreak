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


if __name__ == '__main__':
    unittest.main()
