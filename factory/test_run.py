import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run


class RetryInputsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.day = self.root / 'runs' / '2026-11-04'
        self.day.mkdir(parents=True)
        (self.day / 'sites.json').write_text(json.dumps({'sites': [
            {'file': 'crawl.json', 'name': 'site', 'url': 'https://example.com'}]}))
        (self.root / 'crawl.json').write_text('{}')
        (self.day / 'content.json').write_text('content one')
        marker = patch.object(run, 'mark')
        marker.start()
        self.addCleanup(marker.stop)

    def main(self, start, agent, tool):
        with patch.object(run, 'ROOT', self.root), patch.object(run, 'agent', agent), \
                patch.object(run, 'tool', tool), patch.object(sys, 'argv', ['run.py', '2026-11-04', '--from', start, '--no-images']):
            run.main()

    def test_storymaker_requires_picks_and_ideas(self):
        (self.root / 'runs/shared').mkdir()
        (self.root / 'runs/shared/crew.json').write_text('{}')
        for missing in ('picks.json', 'ideas-1.json'):
            with self.subTest(missing=missing):
                for name in ('picks.json', 'ideas-1.json'):
                    (self.day / name).write_text('{}')
                (self.day / missing).unlink()
                with self.assertRaisesRegex(SystemExit, missing):
                    self.main('storymaker', run.agent, lambda *args: (True, '{}'))

    def plan(self, shop):
        return {'acts': [{'packs': {'early': [['a']], 'mid': [['a']], 'late': [['a']]},
                          'elites': [{'id': 'e', 'reward': 'r'}], 'shop': [shop]}]}

    def test_history_rejects_a_b_a_and_ignored_fields_and_resumes(self):
        calls = []
        def tool(*args):
            calls.append(args[0])
            if args[0] == 'tools/balance.ts':
                (self.day / 'balance.json').write_text('full report')
                return False, 'failed balance'
            return True, '{}'
        def exercise(name, output, inputs, check, **kwargs):
            for shop in ('a', 'b'):
                output.write_text(json.dumps(self.plan(shop)))
                self.assertEqual(check(), 'failed balance')
            candidate = self.plan('a')
            candidate['extra'] = 'ignored'
            candidate['acts'][0]['elites'][0]['extra'] = 'ignored'
            output.write_text(json.dumps(candidate))
            calls.clear()
            self.assertIn('unchanged', check())
            self.assertNotIn('tools/build-run.ts', calls)
            raise RuntimeError('resume')
        with self.assertRaisesRegex(RuntimeError, 'resume'):
            self.main('gameplay', exercise, tool)
        (self.day / 'assembly-tried.json').unlink()
        (self.day / 'balance-tried.json').unlink()
        def resume(name, output, inputs, check, **kwargs):
            self.assertEqual(json.loads(Path(inputs['last-assembly.json']).read_text()), self.plan('b'))
            self.assertEqual(Path(inputs['balance.json']).read_text(), 'full report')
            output.write_text(json.dumps(self.plan('a')))
            self.assertIn('unchanged', check())
            raise RuntimeError('verified')
        with self.assertRaisesRegex(RuntimeError, 'verified'):
            self.main('gameplay', resume, tool)
        (self.day / 'content.json').write_text('different content')
        with self.assertRaisesRegex(SystemExit, 'missing or mismatched'):
            self.main('gameplay', resume, tool)

    def test_interrupted_failure_recovers_only_after_history_replacement(self):
        def tool(*args):
            if args[0] == 'tools/balance.ts':
                (self.day / 'balance.json').write_text('full report')
                return False, 'failed'
            return True, '{}'

        def exercise(name, output, inputs, check, **kwargs):
            output.write_text(json.dumps(self.plan('a')))
            check()

        def resume(name, output, inputs, check, **kwargs):
            self.assertEqual(json.loads(Path(inputs['last-assembly.json']).read_text()), self.plan('a'))
            self.assertEqual(Path(inputs['balance.json']).read_text(), 'full report')
            self.assertFalse((self.day / 'balance-pending.json').exists())
            output.write_text(json.dumps(self.plan('a')))
            self.assertIn('unchanged', check())
            raise RuntimeError('recovered')

        for point in ('before', 'after', 'partial'):
            with self.subTest(point=point):
                for path in self.day.glob('balance*'):
                    path.unlink()
                (self.day / 'assembly-tried.json').unlink(missing_ok=True)
                replace = os.replace
                write_text = Path.write_text
                def interrupted_replace(src, dst):
                    if point == 'before':
                        raise RuntimeError('interrupted')
                    replace(src, dst)
                    if point == 'after':
                        raise RuntimeError('interrupted')
                def interrupted_write(path, *args, **kwargs):
                    if point == 'partial' and path.name == 'balance-tried.json':
                        raise RuntimeError('interrupted')
                    return write_text(path, *args, **kwargs)
                with patch.object(run.os, 'replace', interrupted_replace), patch.object(Path, 'write_text', interrupted_write):
                    with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                        self.main('gameplay', exercise, tool)
                if point == 'before':
                    with self.assertRaisesRegex(SystemExit, 'missing or mismatched'):
                        self.main('gameplay', resume, tool)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'recovered'):
                        self.main('gameplay', resume, tool)

    def test_new_pending_attempt_rejects_older_history(self):
        def tool(*args):
            if args[0] == 'tools/balance.ts':
                (self.day / 'balance.json').write_text('full report')
                return False, 'failed'
            return True, '{}'
        def exercise(name, output, inputs, check, **kwargs):
            output.write_text(json.dumps(self.plan('a')))
            self.assertEqual(check(), 'failed')
            output.write_text(json.dumps(self.plan('b')))
            check()
        replace = os.replace
        calls = []
        def interrupt_second(src, dst):
            calls.append(1)
            if len(calls) == 2:
                raise RuntimeError('interrupted')
            replace(src, dst)
        with patch.object(run.os, 'replace', interrupt_second):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                self.main('gameplay', exercise, tool)
        with self.assertRaisesRegex(SystemExit, 'missing or mismatched'):
            self.main('gameplay', lambda *a, **k: self.fail('worker started'), tool)

    def test_missing_or_mismatched_evidence_stops(self):
        (self.day / 'assembly-tried.json').write_text(json.dumps(self.plan('a')))
        with self.assertRaisesRegex(SystemExit, 'missing or mismatched'):
            self.main('gameplay', lambda *a, **k: self.fail('worker started'), lambda *a: (True, '{}'))

    def test_success_cleans_retry_evidence(self):
        def tool(*args):
            if args[0] == 'tools/balance.ts':
                (self.day / 'balance.json').write_text('report')
                return (False, 'failed') if not (self.day / 'balance-history.json').exists() else (True, 'passed')
            return True, '{}'
        def exercise(name, output, inputs, check, **kwargs):
            if name == 'art':
                return
            output.write_text(json.dumps(self.plan('a')))
            self.assertEqual(check(), 'failed')
            output.write_text(json.dumps(self.plan('b')))
            self.assertEqual(check(), '')
        self.main('gameplay', exercise, tool)
        for name in ('assembly-tried.json', 'balance-tried.json', 'balance-tried-provenance.json', 'balance-history.json', 'balance-pending.json'):
            self.assertFalse((self.day / name).exists())

    def test_agent_stops_after_three_failed_attempts(self):
        calls = []
        def invoke(*args, **kwargs):
            calls.append(1)
            Path(args[0][args[0].index('-C') + 1], 'output.json').write_text('{}')
            return unittest.mock.Mock(stdout='', stderr='')
        with patch.object(run, 'AGENTS', self.root), patch.object(run.subprocess, 'run', invoke):
            (self.root / 'gameplay.md').write_text('prompt')
            with self.assertRaisesRegex(SystemExit, 'failed after 3 attempts'):
                run.agent('gameplay', self.day / 'output.json', {}, lambda: 'failed')
        self.assertEqual(len(calls), 3)
        self.assertFalse((self.day / 'output.json').exists())

    def test_agent_allows_no_retry_pair_and_rejects_partial_pair(self):
        required = self.day / 'content.json'
        plan, report = self.day / 'plan.json', self.day / 'report.json'
        inputs = {'content.json': required, 'plan.json': plan, 'report.json': report}
        def invoke(*args, **kwargs):
            Path(args[0][args[0].index('-C') + 1], 'output.json').write_text('{}')
            return unittest.mock.Mock(stdout='', stderr='')
        with patch.object(run, 'AGENTS', self.root), patch.object(run.subprocess, 'run', invoke):
            (self.root / 'gameplay.md').write_text('prompt')
            run.agent('gameplay', self.day / 'output.json', inputs, lambda: '', optional_pair=('plan.json', 'report.json'))
            plan.write_text('{}')
            with self.assertRaisesRegex(SystemExit, 'as a pair'):
                run.agent('gameplay', self.day / 'output.json', inputs, lambda: '', optional_pair=('plan.json', 'report.json'))


if __name__ == '__main__':
    unittest.main()
