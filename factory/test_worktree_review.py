import unittest

import worktree_review as review


class WorktreeReviewTest(unittest.TestCase):
    def test_association_is_evidence_not_permission(self):
        inventory = {'worktrees': [
            {'path': '/repo/swarmbreak-pr-12', 'worktree_record': ['HEAD abc'],
             'status_entries': [], 'allocated_kib_estimate': 10, 'complete': True,
             'retention_reasons': ['ownership, activity, job state and saved work not verified']},
            {'path': '/repo/swarmbreak-issue-7', 'worktree_record': ['HEAD def'],
             'status_entries': ['?? notes'], 'allocated_kib_estimate': 20, 'complete': True,
             'retention_reasons': ['untracked files']},
            {'path': '/repo/swarmbreak-pr-13', 'status_entries': None, 'complete': False},
        ]}
        report = review.review(inventory, 'Merge pull request #12 from org/fix/issue-7\n', '/repo/swarmbreak-issue-7')
        clean, dirty, unknown = report['worktrees']
        self.assertEqual(clean['association'], 'path named for locally recorded merged PR #12')
        self.assertEqual(clean['state'], 'clean')
        self.assertEqual(dirty['association'], 'branch named in locally recorded merge for PR #12')
        self.assertEqual(dirty['state'], 'untracked')
        self.assertEqual(dirty['activity'], 'current checkout at report generation')
        self.assertEqual(clean['activity'], 'unknown')
        self.assertEqual(unknown['state'], 'uncertain')
        self.assertTrue(all(item['action'] == 'retain; manual review required' for item in report['worktrees']))

    def test_ignored_files_and_incomplete_scans_are_not_clean(self):
        for entries, complete, expected in [(['!! cache/'], True, 'ignored'),
                                             ([], False, 'uncertain'),
                                             ([' M file'], True, 'tracked changes')]:
            item = {'path': '/repo/swarmbreak-pr-1', 'status_entries': entries, 'complete': complete}
            self.assertEqual(review.review({'worktrees': [item]}, '')['worktrees'][0]['state'], expected)


if __name__ == '__main__':
    unittest.main()
