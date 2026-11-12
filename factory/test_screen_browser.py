#!/usr/bin/env python3
"""Host browser resolution and fail-closed screen-check regression tests."""
import json
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pr_team


def test_screen_browser():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        configured = root / 'configured chrome'
        configured.write_text('#!/bin/sh\nexit 1\n')
        configured.chmod(0o755)
        with patch.dict(os.environ, {'SWARMBREAK_CHROME': str(configured)}), patch('pr_team.browser_starts', return_value=True):
            assert pr_team.screen_browser() == str(configured)
            configured.chmod(0o644)
            try:
                pr_team.screen_browser()
                assert False, 'invalid configuration must not fall back'
            except pr_team.HostVerificationError as exc:
                assert 'SWARMBREAK_CHROME' in str(exc) and str(configured) in str(exc)
        configured.chmod(0o755)
        with patch.dict(os.environ, {'SWARMBREAK_CHROME': 'chromium'}), \
             patch('pr_team.shutil.which', return_value=str(configured)), \
             patch('pr_team.browser_starts', return_value=True):
            assert pr_team.screen_browser() == str(configured)
        for resolved, starts in ((None, True), (str(configured), False)):
            with patch.dict(os.environ, {'SWARMBREAK_CHROME': 'missing'}), \
                 patch('pr_team.shutil.which', return_value=resolved), \
                 patch('pr_team.browser_starts', return_value=starts):
                try:
                    pr_team.screen_browser()
                    assert False, 'invalid explicit browser must not fall back'
                except pr_team.HostVerificationError as exc:
                    assert 'SWARMBREAK_CHROME' in str(exc) and 'missing' in str(exc)
        with patch.dict(os.environ, {}, clear=True), patch('pr_team.Path.home', return_value=root), \
             patch('pr_team.shutil.which', side_effect=lambda name: str(configured) if name == 'chromium' else None), \
             patch('pr_team.Path.is_file', autospec=True, side_effect=lambda p: p == configured), \
             patch('pr_team.browser_starts', return_value=True):
            assert pr_team.screen_browser() == str(configured)
        with patch.dict(os.environ, {}, clear=True), patch('pr_team.Path.home', return_value=root), \
             patch('pr_team.shutil.which', return_value=None), patch('pr_team.Path.is_file', return_value=False), \
             patch('pr_team.sandboxed') as build:
            try:
                pr_team.screens('.')
                assert False, 'missing browser must refuse verification'
            except pr_team.HostVerificationError as exc:
                assert 'no headless browser' in str(exc) and 'SWARMBREAK_CHROME' in str(exc)
            build.assert_not_called()
        broken = root / 'chromium'
        working = root / 'google-chrome'
        for browser in (broken, working):
            browser.write_text('#!/bin/sh\nexit 1\n')
            browser.chmod(0o755)
        candidates = lambda name: {'chromium': str(broken), 'google-chrome': str(working)}.get(name)
        with patch.dict(os.environ, {}, clear=True), patch('pr_team.Path.home', return_value=root), \
             patch('pr_team.shutil.which', side_effect=candidates), \
             patch('pr_team.Path.is_file', autospec=True, side_effect=lambda p: p in (broken, working)), \
             patch('pr_team.browser_starts', side_effect=lambda exe: exe == str(working)) as probe:
            assert pr_team.screen_browser() == str(working)
            assert [call.args[0] for call in probe.call_args_list] == [str(broken), str(working)]
        with patch.dict(os.environ, {}, clear=True), patch('pr_team.Path.home', return_value=root), \
             patch('pr_team.shutil.which', side_effect=candidates), \
             patch('pr_team.Path.is_file', autospec=True, side_effect=lambda p: p in (broken, working)), \
             patch('pr_team.browser_starts', return_value=False) as probe:
            try:
                pr_team.screen_browser()
                assert False, 'all failing browsers must refuse verification'
            except pr_team.HostVerificationError as exc:
                assert 'no headless browser' in str(exc)
            assert probe.call_count == 2
        assert not pr_team.browser_starts(str(broken))
        # An executable can still fail at launch or during inspection; it never passes unseen.
        with patch('pr_team.screen_browser', return_value=str(configured)), \
             patch('pr_team.sandboxed', return_value=SimpleNamespace(returncode=0, stdout='', stderr='')), \
             patch('pr_team.subprocess.run', return_value=SimpleNamespace(returncode=1, stdout='', stderr='Chrome exited 1: broken')):
            refusal = pr_team.screens('.')
            assert 'looked at no screens' in refusal and str(configured) in refusal and 'Chrome exited 1: broken' in refusal
        shot = {'screen': 'map', 'width': 390, 'errors': [], 'selects': 0, 'scrollWidth': 390, 'buttons': []}
        with patch('pr_team.screen_browser', return_value=str(configured)), \
             patch('pr_team.sandboxed', return_value=SimpleNamespace(returncode=0, stdout='', stderr='')), \
             patch('pr_team.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps([shot]), stderr='')) as driver:
            assert pr_team.screens('.') == ''
            assert driver.call_args.args[0][2] == str(configured)


if __name__ == '__main__':
    test_screen_browser()
    print('ok screen browser discovery')
