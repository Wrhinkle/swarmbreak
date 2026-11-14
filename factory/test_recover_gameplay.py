import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import recover_gameplay as recovery


class RecoveryTest(unittest.TestCase):
    def test_mismatch_restore_and_repeated_attempt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            active, source, archive = (root / x for x in ('active', 'matching', 'archive'))
            active.mkdir()
            source.mkdir()
            plan = {'acts': [{'packs': {x: [] for x in ('early', 'mid', 'late')}, 'elites': [], 'shop': []}]}
            for name, data in [('content.json', '{"version": 1}'), ('assembly-tried.json', json.dumps(plan)), ('balance-tried.json', 'failed report')]:
                (source / name).write_text(data)
            hashes = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in recovery.NAMES[:3]}
            (source / recovery.NAMES[3]).write_text(json.dumps(hashes))
            for name in recovery.NAMES:
                (active / name).write_bytes((source / name).read_bytes())
            (active / 'content.json').write_text('{"version": 2}')
            (active / 'other-evidence').write_text('keep')
            with self.assertRaisesRegex(ValueError, 'provenance'):
                recovery.verify_set(active)
            recovery.recover(active, source, archive)
            recovery.verify_set(active)
            self.assertEqual((archive / 'content.json').read_text(), '{"version": 2}')
            self.assertEqual((archive / 'other-evidence').read_text(), 'keep')
            with self.assertRaisesRegex(ValueError, 'already active'):
                recovery.recover(active, source, root / 'another-archive')

    def test_bad_source_and_pending_preserve_active(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            active, source = root / 'active', root / 'source'
            active.mkdir(); source.mkdir()
            (active / 'balance-pending.json').write_text('evidence')
            with self.assertRaisesRegex(ValueError, 'pending'):
                recovery.recover(active, source, root / 'archive')
            self.assertEqual((active / 'balance-pending.json').read_text(), 'evidence')
            self.assertFalse((root / 'archive').exists())


if __name__ == '__main__':
    unittest.main()
