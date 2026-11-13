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

    def test_issue_names_associate_local_merges_without_authorizing_cleanup(self):
        names = ['swarmbreak-issue-7', 'swarmbreak-issue-7-dry',
                 'swarmbreak-issue-8-dry', 'swarmbreak-issue-7-dry-extra']
        inventory = {'worktrees': [
            {'path': '/repo/' + name, 'status_entries': [], 'complete': True}
            for name in names
        ]}
        items = review.review(inventory, 'Merge pull request #12 from org/fix/issue-7\n')['worktrees']
        self.assertEqual(items[0]['association'], 'branch named in locally recorded merge for PR #12')
        self.assertEqual(items[1]['association'],
                         'issue name matches branch in locally recorded merge for PR #12; '
                         'dry-run worktree is detached; match does not establish its contents or current status')
        for item in items[2:]:
            self.assertEqual(item['association'], 'unknown; verify current job and remote state')
        self.assertTrue(all(item['action'] == 'retain; manual review required' for item in items))

    def test_ignored_files_and_incomplete_scans_are_not_clean(self):
        for entries, complete, expected in [(['!! cache/'], True, 'ignored'),
                                             ([], False, 'uncertain'),
                                             ([' M file'], True, 'tracked changes')]:
            item = {'path': '/repo/swarmbreak-pr-1', 'status_entries': entries, 'complete': complete}
            self.assertEqual(review.review({'worktrees': [item]}, '')['worktrees'][0]['state'], expected)


if __name__ == '__main__':
    unittest.main()
