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


def agent(name, output, inputs, check, search=False):
    """Runs one agent in an empty folder holding only its inputs. Returns once `check` finds no problems."""
    problems = ''
    for attempt in range(RETRIES + 1):
        with tempfile.TemporaryDirectory() as work:
            for dest, src in inputs.items():
                shutil.copy(src, Path(work) / dest)
            prompt = (AGENTS / f'{name}.md').read_text() + f'\n\nInput files in this folder: {", ".join(inputs) or "none"}. Write {Path(output).name} here and nothing else.'
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
            used.write_text(json.dumps(hosts))
            agent('researcher', picks, {'used-hosts.json': used}, lambda: result(tool('tools/checks.ts', 'picks', rel(picks), str(ACTS))), search=True)
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
            report.unlink(missing_ok=True)

            def check_plan():
                bad = result(tool('tools/checks.ts', 'assembly', rel(assembly), rel(content)))
                if bad:
                    return bad
                ok, out = tool('tools/build-run.ts', rel(d))
                if not ok:
                    return out
                ok, out = tool('tools/balance.ts', f'public/runs/{run_id}/run.json', '--tune', '--report', rel(report))
                print(out, flush=True)
                return '' if ok else out

            def inputs():
                return {'content.json': content, 'library.json': library}
            agent('gameplay', assembly, inputs(), check_plan)

        if want('art'):
            agent('art', brief, {'content.json': content}, lambda: '' if len(json.loads(brief.read_text()).get('acts', [])) == ACTS else f'Write {ACTS} acts.')
            if '--no-images' not in args:
                py = ROOT / 'factory/.venv/bin/python'
                if subprocess.run([py, ROOT / 'factory/art.py', run_id], cwd=ROOT, env=clean_env()).returncode:
                    sys.exit('Art failed. Stopping; nothing was opened.')
    print(f'Run {run_id} is ready. Open it with a reviewed PR.', flush=True)


if __name__ == '__main__':
    main()
