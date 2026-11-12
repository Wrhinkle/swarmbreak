import json
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

    def test_gameplay_retry_pair_matches_report_and_content(self):
        calls = []

        def tool(*args):
            if args[0] == 'tools/balance.ts':
                calls.append(1)
                if len(calls) == 1:
                    (self.day / 'balance.json').write_text('report one')
                return False, 'failed balance'
            return True, '{}'

        def fail_twice(name, output, inputs, check, **kwargs):
            self.assertEqual(name, 'gameplay')
            self.assertFalse(Path(inputs['last-assembly.json']).exists())
            output.write_text('plan one')
            check()
            output.write_text('plan two')
            check()
            raise RuntimeError('stop for resume')

        with self.assertRaisesRegex(RuntimeError, 'stop for resume'):
            self.main('gameplay', fail_twice, tool)
        self.assertEqual((self.day / 'assembly-tried.json').read_text(), 'plan one')
        self.assertEqual((self.day / 'balance-tried.json').read_text(), 'report one')

        def inspect_resume(expected):
            def inspect(name, output, inputs, check, **kwargs):
                self.assertEqual(Path(inputs['last-assembly.json']).exists(), expected)
                self.assertEqual(Path(inputs['balance.json']).exists(), expected)
                raise RuntimeError('stop for resume')
            with self.assertRaisesRegex(RuntimeError, 'stop for resume'):
                self.main('gameplay', inspect, tool)

        inspect_resume(True)
        (self.day / 'content.json').write_text('regenerated content')
        inspect_resume(False)

    def test_gameplay_does_not_replay_identical_failed_plan(self):
        calls = []

        def tool(*args):
            calls.append(args[0])
            if args[0] == 'tools/balance.ts':
                (self.day / 'balance.json').write_text('failed report')
                return False, 'failed balance'
            return True, '{}'

        def exercise(name, output, inputs, check, **kwargs):
            output.write_text('{"acts": [{"shop": ["a"]}]}')
            self.assertEqual(check(), 'failed balance')
            calls.clear()
            output.write_text('{ "acts" : [ { "shop" : ["a"] } ] }')
            self.assertIn('unchanged', check())
            self.assertNotIn('tools/build-run.ts', calls)
            self.assertNotIn('tools/balance.ts', calls)
            calls.clear()
            output.write_text('{"acts": [{"shop": ["b"]}]}')
            self.assertEqual(check(), 'failed balance')
            self.assertIn('tools/balance.ts', calls)
            raise RuntimeError('stop')

        with self.assertRaisesRegex(RuntimeError, 'stop'):
            self.main('gameplay', exercise, tool)

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
