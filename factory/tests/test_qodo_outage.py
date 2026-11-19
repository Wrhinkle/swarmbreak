import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pr_team


class FindingsOutageTest(unittest.TestCase):
    def invoke(self, code, output):
        response = SimpleNamespace(returncode=code, stdout=output, stderr='')
        with patch.object(pr_team.subprocess, 'run', return_value=response):
            return pr_team.findings('url')

    def test_upstream_outage_waits_without_accepting_a_review(self):
        with self.assertRaises(SystemExit) as raised:
            self.invoke(1, json.dumps({'error': {'code': 'MT-UPSTREAM-DOWN'}}))
        self.assertEqual(raised.exception.code, pr_team.WAITING)

    def test_other_failures_still_fail(self):
        for output in ('bad json', '{"error":{"code":"OTHER"}}', '{"error":null}'):
            with self.subTest(output=output), self.assertRaises(SystemExit) as raised:
                self.invoke(1, output)
            self.assertNotEqual(raised.exception.code, pr_team.WAITING)

    def test_success_returns_findings(self):
        data = {'findings': [], 'review_session': {'review_complete': True}}
        self.assertEqual(self.invoke(0, json.dumps(data)), data)


if __name__ == '__main__':
    unittest.main()
