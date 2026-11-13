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

    def review(self, findings, mutate=False, response=None):
        seen = []
        def run(cmd, **kwargs):
            if cmd[0] != pr_team.QODO:
                return self.original_run(cmd, **kwargs)
            seen.append((cmd, json.loads(kwargs['input']), self.git('diff', '--cached', '--name-only'), self.git('log', '--oneline')))
            if mutate:
                (self.tree / 'new').write_text('changed during review')
            return SimpleNamespace(stdout=json.dumps(response if response is not None else {'findings': [dict(f, id=str(i)) for i, f in enumerate(findings)], 'meta': {'coverage': {'complete': True}}, 'finding_state': {'complete': True, 'introduced': [str(i) for i in range(len(findings))], 'resolved': [], 'still_open': [], 'dismissed': []}}), stderr='', returncode=0)
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

    def test_incomplete_or_malformed_reviews_stop(self):
        complete = {'findings': [], 'meta': {'coverage': {'complete': True}}, 'finding_state': {'complete': True, 'introduced': [], 'resolved': [], 'still_open': [], 'dismissed': []}}
        cases = [
            {'findings': []},
            {**complete, 'meta': {'coverage': {'complete': False}}},
            {**complete, 'meta': {'coverage': None}},
            {**complete, 'finding_state': {'complete': False}},
            {**complete, 'finding_state': None},
            {**complete, 'findings': [{}]},
            {**complete, 'findings': [{'action_level': 'unknown'}]},
            {**complete, 'findings': ['invalid']},
        ]
        for response in cases:
            with self.subTest(response=response), self.assertRaisesRegex(SystemExit, 'nothing was committed'):
                self.review([], response=response)
        self.review([{'action_level': 'remediation_recommended'}])

    def test_failed_or_invalid_review_stops(self):
        for result in [SimpleNamespace(stdout='{}', stderr='', returncode=0),
                       SimpleNamespace(stdout='{"findings": []}', stderr='', returncode=1)]:
            with self.subTest(result=result), patch.object(pr_team.subprocess, 'run', return_value=result), \
                 patch.object(pr_team, 'sh', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=1), SimpleNamespace(stdout='tree')]):
                with self.assertRaisesRegex(SystemExit, 'nothing was committed'):
                    pr_team.review_fixer_changes(self.tree, 'branch', {}, [{'title': 'Bug', 'plan': 'Fix'}], [])


class MainFixerReviewTests(unittest.TestCase):
    def run_main(self, blocking=False, hook=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'repo'
            root.mkdir()
            tree = Path(directory) / 'swarmbreak-pr-7'
            tree.mkdir()
            def git(*args):
                return subprocess.run(['git', *args], cwd=tree, check=True, capture_output=True, text=True).stdout
            git('init', '-q')
            git('config', 'user.name', 'Test')
            git('config', 'user.email', 'test@example.com')
            (tree / 'tracked').write_text('before')
            git('add', '-A')
            git('commit', '-qm', 'base')
            if hook:
                hook_path = tree / '.git/hooks/pre-commit'
                hook_path.write_text('#!/bin/sh\necho hook > tracked\ngit add tracked\n')
                hook_path.chmod(0o755)
            events = []
            original_sh = pr_team.sh
            original_run = subprocess.run
            pr = {'state': 'OPEN', 'url': 'url', 'headRefName': 'branch', 'baseRefName': 'main',
                  'title': 'Real title', 'body': 'Real body'}
            finding = {'id': 'f', 'title': 'Bug', 'attribution_status': 'pending'}
            def sh(*cmd, **kwargs):
                events.append(tuple(cmd))
                if cmd[:3] == ('gh', 'pr', 'view'):
                    return SimpleNamespace(stdout=json.dumps(pr), returncode=0)
                if cmd[:2] in [('git', 'fetch'), ('git', 'checkout'), ('git', 'push')]:
                    if cmd[:2] == ('git', 'push'):
                        raise RuntimeError('pushed')
                    return SimpleNamespace(stdout='', returncode=0)
                if cmd[:3] == ('git', 'merge-base', '--is-ancestor'):
                    return SimpleNamespace(stdout='', returncode=0)
                return original_sh(*cmd, **kwargs)
            def run(cmd, **kwargs):
                if cmd[0] == pr_team.QODO:
                    events.append(('review', json.loads(kwargs['input'])))
                    findings = [{'id': '1', 'action_level': 'action_required', 'title': 'block'}] if blocking else []
                    return SimpleNamespace(returncode=0, stdout=json.dumps({'findings': [dict(f, id=str(i)) for i, f in enumerate(findings)], 'meta': {'coverage': {'complete': True}}, 'finding_state': {'complete': True, 'introduced': [str(i) for i in range(len(findings))], 'resolved': [], 'still_open': [], 'dismissed': []}}), stderr='')
                return original_run(cmd, **kwargs)
            def bot(name, workdir, *args, **kwargs):
                if name == 'pr-triage':
                    (Path(workdir) / 'decisions.json').write_text(json.dumps({'decisions': [{'id': 'f', 'action': 'fix', 'plan': 'Fix'}]}))
                else:
                    (tree / 'tracked').write_text('fixed')
                    return (0, '')
            with patch.object(pr_team, 'ROOT', root), patch.object(pr_team.sys, 'argv', ['pr_team.py', '7']), \
                 patch.object(pr_team, 'sh', side_effect=sh), patch.object(pr_team.subprocess, 'run', side_effect=run), \
                 patch.object(pr_team, 'hold'), patch.object(pr_team, 'wait_for_review'), \
                 patch.object(pr_team, 'fixer_rounds', return_value=0), patch.object(pr_team, 'findings', return_value={'findings': [finding]}), \
                 patch.object(pr_team, 'bot', side_effect=bot), patch.object(pr_team, 'verified', return_value=''), \
                 patch.object(pr_team, 'begin_fixer_commit', return_value=(None, [])), patch.object(pr_team, 'record_fixer_commit') as record:
                (tree / 'node_modules').mkdir()
                with self.assertRaises((SystemExit, RuntimeError)) as stopped:
                    pr_team.main()
                query = next(e for e in events if e[:3] == ('gh', 'pr', 'view'))
                self.assertTrue({'title', 'body'} <= set(query[-1].split(',')))
                review = next(e for e in events if e[0] == 'review')
                self.assertEqual(review[1]['notes'], 'Task: Real title\n\nReal body')
                review_index = events.index(review)
                commits = [i for i, e in enumerate(events) if e[:2] == ('git', 'commit')]
                pushes = [i for i, e in enumerate(events) if e[:2] == ('git', 'push')]
                if blocking:
                    self.assertIn('Qodo blocks', str(stopped.exception))
                    self.assertFalse(commits or pushes)
                elif hook:
                    self.assertIn('Commit tree differs', str(stopped.exception))
                    self.assertTrue(commits and review_index < commits[0])
                    self.assertFalse(pushes)
                    record.assert_not_called()
                    self.assertFalse(any('mark-implemented' in e for e in events))
                    self.assertEqual(git('show', 'HEAD:tracked').strip(), 'hook')
                else:
                    self.assertTrue(review_index < commits[0] < pushes[0])
                    record.assert_called_once()

    def test_review_receives_context_before_commit_and_push(self):
        self.run_main()

    def test_blocking_review_prevents_commit_and_push(self):
        self.run_main(blocking=True)

    def test_hook_changed_tree_is_not_recorded_or_pushed(self):
        self.run_main(hook=True)


if __name__ == '__main__':
    unittest.main()
