import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pr_team


class FixerReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q', self.tree], check=True)
        self.report = self.tree / '.git-fixes.json'

    def test_report_is_removed_before_staging(self):
        with pr_team.fixer_report(self.tree, [{'title': 'finding'}]):
            self.assertEqual(json.loads(self.report.read_text())[0]['title'], 'finding')
        (self.tree / 'fix').write_text('fixed')
        subprocess.run(['git', '-C', self.tree, 'add', '-A'], check=True)
        staged = subprocess.check_output(['git', '-C', self.tree, 'diff', '--cached', '--name-only'], text=True)
        self.assertEqual(staged.splitlines(), ['fix'])

    def test_existing_or_tracked_report_stops_before_staging(self):
        self.report.write_text('keep')
        with self.assertRaises(SystemExit):
            pr_team.check_fixer_report_absent(self.tree)
        self.assertEqual(self.report.read_text(), 'keep')
        subprocess.run(['git', '-C', self.tree, 'add', '.git-fixes.json'], check=True)
        self.report.unlink()
        with self.assertRaises(SystemExit):
            pr_team.check_fixer_report_absent(self.tree)

    def test_replaced_report_is_preserved_and_stops(self):
        with self.assertRaises(SystemExit):
            with pr_team.fixer_report(self.tree, []):
                self.report.unlink()
                self.report.symlink_to('elsewhere')
        self.assertTrue(self.report.is_symlink())


if __name__ == '__main__':
    unittest.main()
