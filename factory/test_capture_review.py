"""Review capture must identify its commit and requested state, and fail closed."""
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import capture_review


def test_capture_review():
    sha = 'a' * 40
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'evidence'
        def drive(cmd, **kwargs):
            assert cmd[-1] == 'camp-populated'
            for width in (390, 1280):
                (out / f'camp-populated-{width}.png').write_bytes(b'png')
            return SimpleNamespace(returncode=0, stdout=json.dumps([{'screen': 'camp-populated', 'width': w} for w in (390, 1280)]), stderr='')
        with patch('capture_review.export_commit') as export, patch('capture_review.sandbox_works'), patch('capture_review.screen_browser', return_value='/chrome'), patch('capture_review.sandboxed', return_value=SimpleNamespace(returncode=0, stdout='', stderr='')), patch('capture_review.subprocess.run', side_effect=drive):
            capture_review.capture(sha, 'camp-populated', out)
            assert export.call_args.args[0] == sha
            assert json.loads((out / 'capture.json').read_text())['commit'] == sha
            assert json.loads((out / 'capture.json').read_text())['state'] == 'camp-populated'
        out2 = Path(tmp) / 'failure'
        with patch('capture_review.export_commit'), patch('capture_review.sandbox_works'), patch('capture_review.screen_browser', return_value='/chrome'), patch('capture_review.sandboxed', return_value=SimpleNamespace(returncode=0, stdout='', stderr='')), patch('capture_review.subprocess.run', return_value=SimpleNamespace(returncode=1, stdout='[]', stderr='failed')):
            try:
                capture_review.capture(sha, 'camp-empty', out2)
                assert False, 'capture failure must remain unresolved'
            except RuntimeError:
                assert not (out2 / 'capture.json').exists()

if __name__ == '__main__':
    test_capture_review()
