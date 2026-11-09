#!/usr/bin/env python3
"""Builds one day's run: runs each agent, checks its output, and moves on only when the check passes.

Usage: python3 factory/run.py 2026-11-04 [--from researcher|parser|storymaker|gameplay|art] [--no-images]
Stage output lands in runs/<id>/. Nothing here commits, pushes, deploys, or opens a run.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENTS = ROOT / 'factory' / 'agents'
ACTS, RETRIES = 3, 2
STAGES = ['researcher', 'parser', 'storymaker', 'gameplay', 'art']
EFFORT = {'researcher': 'medium', 'parser': 'medium', 'storymaker': 'high', 'gameplay': 'high', 'art': 'medium'}


def clean_env():
    return {k: v for k, v in os.environ.items() if not k.endswith(('_API_KEY', '_AUTH_TOKEN', '_BASE_URL'))}


def tool(*args):
    r = subprocess.run(['npx', 'vite-node', *args], cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def agent(name, output, inputs, check, search=False, optional_pair=()):
    """Runs one agent in an empty folder holding only its inputs. Returns once `check` finds no problems."""
    problems = ''
    for attempt in range(RETRIES + 1):
        with tempfile.TemporaryDirectory() as work:
            missing = [dest for dest, src in inputs.items() if dest not in optional_pair and not Path(src).is_file()]
            if missing:
                sys.exit(f'{name} missing required inputs: {", ".join(missing)}')
            present = [dest for dest in optional_pair if Path(inputs[dest]).is_file()]
            if present and len(present) != len(optional_pair):
                sys.exit(f'{name} requires optional retry inputs as a pair: {", ".join(optional_pair)}')
            given = {dest: src for dest, src in inputs.items() if dest not in optional_pair or dest in present}
            for dest, src in given.items():
                shutil.copy(src, Path(work) / dest)
            prompt = (AGENTS / f'{name}.md').read_text() + f'\n\nInput files in this folder: {", ".join(given) or "none"}. Write {Path(output).name} here and nothing else.'
            if problems:
                prompt += f'\n\nThe last attempt failed these checks. Fix each one:\n{problems}'
            cmd = ['codex', 'exec', '-m', 'gpt-6.1-terra', '-c', f'model_reasoning_effort="{EFFORT[name]}"', '-s', 'workspace-write', '--skip-git-repo-check', '-C', work]
            if search:
                cmd.insert(1, '--search')  # a global codex flag, so it goes before exec
            print(f'[{name}] attempt {attempt + 1}: {Path(output).name}', flush=True)
            r = subprocess.run([*cmd, prompt], stdin=subprocess.DEVNULL, capture_output=True, text=True, env=clean_env(), timeout=1800)
            made = Path(work) / Path(output).name
            if made.exists():
                shutil.copy(made, output)
            else:
                problems = f'{Path(output).name} was not written.'
                print(f'[{name}] no output. {r.stdout[-300:]}{r.stderr[-300:]}', flush=True)
                continue
        problems = check()
        if not problems:
            return
        print(f'[{name}] problems:\n{problems}', flush=True)
    sys.exit(f'{name} failed after {RETRIES + 1} attempts. Stopping; nothing was opened.')


def past_threads(runs, run_id, keep=14):
    """The themes of earlier runs, newest last, so the researcher can move somewhere new."""
    days = sorted(p for p in runs.glob('20*/picks.json') if p.parent.name < run_id)
    return [{'run': p.parent.name, 'thread': json.loads(p.read_text())['thread']} for p in days[-keep:]]


def other_branch_json(name, run_id, cwd=ROOT):
    """One file from each other run still on its own branch, so a built run counts as used before it merges."""
    git = lambda *c: subprocess.run(['git', *c], cwd=cwd, capture_output=True, text=True)
    found = []
    for branch in git('branch', '--format=%(refname:short)', '--list', 'run/*').stdout.split():
        shown = git('show', f'{branch}:runs/{branch[4:14]}/{name}')
        if branch == f'run/{run_id}' or shown.returncode:
            continue
        try:
            found.append(json.loads(shown.stdout))
        except json.JSONDecodeError:  # a failed build's checkpoint can hold anything
            pass
    return found


def main():
    args = sys.argv[1:]
    run_id = args[0]
    start = args[args.index('--from') + 1] if '--from' in args else STAGES[0]
    want = lambda stage: STAGES.index(stage) >= STAGES.index(start)
    d = ROOT / 'runs' / run_id
    d.mkdir(parents=True, exist_ok=True)
    rel = lambda p: str(Path(p).relative_to(ROOT))
    picks, sites_file, content, assembly, brief = d / 'picks.json', d / 'sites.json', d / 'content.json', d / 'assembly.json', d / 'art-brief.json'
    with tempfile.TemporaryDirectory() as shared:
        library = Path(shared) / 'library.json'
        ok, out = tool('tools/checks.ts', 'library')
        if not ok:
            sys.exit(out)
        library.write_text(out)

        def result(ok_out):
            return '' if ok_out[0] else ok_out[1]

        if want('researcher'):
            used = Path(shared) / 'used-hosts.json'
            hosts = [s['host'] for p in (ROOT / 'runs').glob('*/sites.json') for s in json.loads(p.read_text())['sites']]
            hosts += [s['host'] for x in other_branch_json('sites.json', run_id) if isinstance(x, dict) for s in x.get('sites', []) if 'host' in s]
            used.write_text(json.dumps(hosts))
            themes = Path(shared) / 'recent-threads.json'
            unmerged = [{'run': 'built, not yet open', 'thread': x['thread']} for x in other_branch_json('picks.json', run_id) if isinstance(x, dict) and x.get('thread')]
            themes.write_text(json.dumps(past_threads(ROOT / 'runs', run_id) + unmerged))
            agent('researcher', picks, {'used-hosts.json': used, 'recent-threads.json': themes}, lambda: result(tool('tools/checks.ts', 'picks', rel(picks), str(ACTS))), search=True)
            sites = []
            for c in json.loads(picks.read_text())['candidates']:
                if len(sites) == ACTS:
                    break
                host = c['url'].split('/')[2]
                file = d / 'sites' / f'{host}.json'
                file.parent.mkdir(exist_ok=True)
                ok, out = tool('tools/crawl.ts', c['url'], rel(file))
                if ok:
                    ok, out = tool('tools/checks.ts', 'crawl', rel(file))
                print(f'[crawl] {host}: {"ok" if ok else out[-200:]}', flush=True)
                if ok:
                    sites.append({'host': host, 'name': c['name'], 'url': c['url'], 'file': rel(file)})
            if len(sites) < ACTS:
                sys.exit(f'Only {len(sites)} candidates passed the crawl screen. Stopping.')
            sites_file.write_text(json.dumps({'sites': sites}, indent=1) + '\n')
        sites = json.loads(sites_file.read_text())['sites']

        if want('parser'):
            for i, s in enumerate(sites, 1):
                out_file = d / f'ideas-{i}.json'
                agent('parser', out_file, {'site.json': ROOT / s['file']}, lambda f=out_file, s=s: result(tool('tools/checks.ts', 'ideas', rel(f), s['file'])))

        if want('storymaker'):
            inputs = {'picks.json': picks, 'library.json': library, 'crew.json': ROOT / 'runs/shared/crew.json'}
            for i, s in enumerate(sites, 1):
                inputs[f'ideas-{i}.json'] = d / f'ideas-{i}.json'
                inputs[f'crawl-{i}.json'] = ROOT / s['file']

            def check_content():
                # The host sets identity, so a model can't put an address in front of players.
                c = json.loads(content.read_text())
                c['id'], c['seed'] = run_id, int(hashlib.sha256(run_id.encode()).hexdigest()[:8], 16) % 2_000_000_000
                for act, s in zip(c.get('acts', []), sites):
                    act['name'], act['url'] = s['name'], s['url']
                content.write_text(json.dumps(c, indent=1) + '\n')
                return result(tool('tools/checks.ts', 'content', rel(content), rel(sites_file)))
            agent('storymaker', content, inputs, check_content)

        if want('gameplay'):
            report = d / 'balance.json'
            # The last plan that failed balance and its report. Without them each retry was a fresh guess.
            tried, tried_report = d / 'assembly-tried.json', d / 'balance-tried.json'
            provenance = d / 'balance-tried-provenance.json'

            def hashes():
                return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (content, tried, tried_report)}

            try:
                valid = json.loads(provenance.read_text()) == hashes()
            except (OSError, ValueError):
                valid = False
            if not valid:
                for p in (tried, tried_report, provenance):
                    p.unlink(missing_ok=True)

            def check_plan():
                bad = result(tool('tools/checks.ts', 'assembly', rel(assembly), rel(content)))
                if bad:
                    return bad
                ok, out = tool('tools/build-run.ts', rel(d))
                if not ok:
                    return out
                report.unlink(missing_ok=True)
                ok, out = tool('tools/balance.ts', f'public/runs/{run_id}/run.json', '--tune', '--report', rel(report))
                print(out, flush=True)
                if not ok and report.exists():
                    provenance.unlink(missing_ok=True)
                    shutil.copy(assembly, tried)
                    shutil.copy(report, tried_report)
                    provenance.write_text(json.dumps(hashes()))
                return '' if ok else out

            agent('gameplay', assembly, {'content.json': content, 'library.json': library, 'last-assembly.json': tried, 'balance.json': tried_report}, check_plan, optional_pair=('last-assembly.json', 'balance.json'))
            tried.unlink(missing_ok=True)
            tried_report.unlink(missing_ok=True)
            provenance.unlink(missing_ok=True)

        if want('art'):
            agent('art', brief, {'content.json': content}, lambda: '' if len(json.loads(brief.read_text()).get('acts', [])) == ACTS else f'Write {ACTS} acts.')
            if '--no-images' not in args:
                py = ROOT / 'factory/.venv/bin/python'
                if subprocess.run([py, ROOT / 'factory/art.py', run_id], cwd=ROOT, env=clean_env()).returncode:
                    sys.exit('Art failed. Stopping; nothing was opened.')
    print(f'Run {run_id} is ready. Open it with a reviewed PR.', flush=True)


if __name__ == '__main__':
    main()
