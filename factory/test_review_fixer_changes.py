import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pr_team


class FixerReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name)
        self.git('init', '-q')
        (self.tree / 'tracked').write_text('before')
        self.git('add', '-A')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base')
        (self.tree / 'tracked').write_text('after')
        (self.tree / 'new').write_text('new')
        self.original_run = subprocess.run

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.tree, check=True, capture_output=True, text=True).stdout

    def review(self, findings, mutate=False):
        seen = []
        def run(cmd, **kwargs):
            if cmd[0] != pr_team.QODO:
                return self.original_run(cmd, **kwargs)
            seen.append((cmd, json.loads(kwargs['input']), self.git('diff', '--cached', '--name-only'), self.git('log', '--oneline')))
            if mutate:
                (self.tree / 'new').write_text('changed during review')
            return SimpleNamespace(stdout=json.dumps({'findings': findings}), stderr='', returncode=0)
        with patch.object(pr_team.subprocess, 'run', side_effect=run):
            pr_team.review_fixer_changes(self.tree, 'branch', {'title': 'Task', 'body': 'Expected behavior'},
                                         [{'title': 'Bug', 'plan': 'Fix it'}], [])
        return seen

    def test_reviews_same_staged_and_new_files_before_commit_with_context(self):
        seen = self.review([])
        cmd, context, paths, history = seen[0]
        self.assertIn('--context-file', cmd)
        self.assertEqual(context['notes'], 'Task: Task\n\nExpected behavior')
        self.assertEqual(context['decisions'], ['Fix "Bug": Fix it'])
        self.assertEqual(paths.splitlines(), ['new', 'tracked'])
        self.assertEqual(len(history.splitlines()), 1)
        self.assertEqual(self.git('diff', '--cached', '--name-only'), paths)

    def test_every_action_required_blocks_even_resolved(self):
        with self.assertRaisesRegex(SystemExit, 'Qodo blocks'):
            self.review([{'title': 'Still blocks', 'action_level': 'action_required', 'status': 'resolved'}])
        self.assertEqual(len(self.git('log', '--oneline').splitlines()), 1)

    def test_changed_during_review_cannot_commit(self):
        with self.assertRaisesRegex(SystemExit, 'moved during Qodo review'):
            self.review([], mutate=True)

    def test_failed_or_invalid_review_stops(self):
        for result in [SimpleNamespace(stdout='{}', stderr='', returncode=0),
                       SimpleNamespace(stdout='{"findings": []}', stderr='', returncode=1)]:
            with self.subTest(result=result), patch.object(pr_team.subprocess, 'run', return_value=result), \
                 patch.object(pr_team, 'sh', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=1), SimpleNamespace(stdout='tree')]):
                with self.assertRaisesRegex(SystemExit, 'nothing was committed'):
                    pr_team.review_fixer_changes(self.tree, 'branch', {}, [{'title': 'Bug', 'plan': 'Fix'}], [])


if __name__ == '__main__':
    unittest.main()
