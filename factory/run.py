#!/usr/bin/env python3
"""Builds one day's run: runs each agent, checks its output, and moves on only when the check passes.

Usage: python3 factory/run.py 2026-11-04 [--from researcher|parser|storymaker|gameplay|art] [--no-images]
Stage output lands in runs/<id>/. Nothing here commits, pushes, deploys, or opens a run.
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, uuid
from pathlib import Path
from codex_failure import stop_on_codex_failure
from urllib.parse import urlparse

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


def ledger_file(d):
    """Where run folder `d`'s passed checks are recorded: the repository's own git folder, which every worktree shares.
    It is in no commit and in no worker's workspace, so a branch, a PR or an agent can't hand the host a pass."""
    d = Path(d)
    common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=d, capture_output=True, text=True, check=True)
    return Path(common.stdout.strip()) / 'swarmbreak-checked' / f'{d.name}.json'


def ledger(d):
    """The run's ledger as a dict. A missing or half-written one is empty, so its outputs get checked again."""
    try:
        seen = json.loads(ledger_file(d).read_text())
    except (OSError, ValueError, subprocess.CalledProcessError):
        return {}
    return seen if isinstance(seen, dict) else {}


def basis(root, built_from):
    """One hash of what a passed check rested on: the files the output was built from, and the code that checked it
    (this file, the package lock, every tool, and whatever the tools import). A change to any of them and the old pass says nothing."""
    todo, code = [root / 'factory' / 'run.py', root / 'package-lock.json', *(root / 'tools').glob('*.ts')], set()
    while todo:
        f = Path(os.path.normpath(todo.pop()))
        if f in code or f.name.endswith('.test.ts') or not f.is_file():
            continue
        code.add(f)
        todo += [f.parent / f'{m}.ts' for m in re.findall(r"""from ['"](\.[^'"]+)['"]""", f.read_text())]
    h = hashlib.sha256()
    for f in sorted({*code, *(root / p for p in built_from)}):
        h.update(str(f.relative_to(root)).encode() + b'\0' + f.read_bytes() + b'\0')
    return h.hexdigest()


def mark(output, passed, built_from=()):
    """Keeps the run's ledger: for each output that passed its check, its hash, the files it was built from, and their basis().
    A resumed run trusts nothing else. Files outside the repo are the host's own, made fresh each run from code basis() covers."""
    output = Path(output)
    root, seen = output.parents[2], ledger(output.parent)
    seen.pop(output.name, None)
    if passed:
        used = sorted(str(Path(p).relative_to(root)) for p in built_from if Path(p).is_relative_to(root))
        seen[output.name] = {'sha': hashlib.sha256(output.read_bytes()).hexdigest(), 'from': used, 'basis': basis(root, used)}
    file = ledger_file(output.parent)
    file.parent.mkdir(exist_ok=True)
    fresh = file.with_suffix('.tmp')
    fresh.write_text(json.dumps(seen, indent=1) + '\n')
    os.replace(fresh, file)  # whole file or none: a run killed mid-write leaves the old ledger


def checked(output):
    """True only when `output` is byte for byte what passed its check, what it was built from is unchanged, and so is the checking code.
    A file from before the ledger, a failed attempt, a later edit, or a pass under older checks is not."""
    output = Path(output)
    entry = ledger(output.parent).get(output.name)
    try:
        return entry['sha'] == hashlib.sha256(output.read_bytes()).hexdigest() and entry['basis'] == basis(output.parents[2], entry['from'])
    except (OSError, TypeError, KeyError, ValueError):
        return False


def clashes(d):
    """Whether run folder `d` picked a site, or lists a backup candidate in picks.json, that another run's sites.json has:
    what the picks check in tools/checks.ts refuses. It reads every candidate, not just the ones chosen, so this does too.
    The ledger records what a pass was built from, and a run added or changed later isn't in it, so a resumed run asks again.
    Other runs are the ones in this checkout and the ones still on their own branch, the same two places the researcher's used-hosts list reads."""
    norm = lambda host: re.sub(r'^www\.', '', re.sub(r'\.$', '', re.sub(r':\d+$', '', host).lower()))  # normalizeHost in tools/checks.ts
    hosts = lambda x: {norm(s['host']) for s in x.get('sites', [])}
    read = lambda p: json.loads(p.read_text())
    try:
        used = {h for p in d.parent.glob('*/sites.json') if p.parent != d for h in hosts(read(p))}
        # A branch can hold a failed build's half-written file. The researcher's list skips entries it can't read there, so this does too:
        # one broken branch must not send every finished run back to the start.
        used |= {norm(s['host']) for x in other_branch_json('sites.json', d.name, cwd=d.parent.parent) if isinstance(x, dict)
                 for s in (x.get('sites') if isinstance(x.get('sites'), list) else []) if isinstance(s, dict) and isinstance(s.get('host'), str)}
        mine = hosts(read(d / 'sites.json')) | {norm(urlparse(c['url']).hostname or '') for c in read(d / 'picks.json')['candidates']}
        return bool(mine & used)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return True  # the picks check can't read it either


def played(d):
    """What a passing balance report in run folder `d` rests on: the story, the plan, the shared crew, and the playable file
    the build made from them and the bots played. Change any and the gameplay stage builds and checks the run again."""
    root = Path(d).parents[1]
    return [d / 'content.json', d / 'assembly.json', root / 'runs' / 'shared' / 'crew.json', root / 'public' / 'runs' / Path(d).name / 'run.json']


MADE = {'parser': [f'ideas-{i}.json' for i in range(1, ACTS + 1)], 'storymaker': ['content.json']}


def begin(d, stage):
    """Starting a stage makes its old output, and everything built from it, stale. A run stopped partway must not resume past it on old work."""
    for redo in STAGES[STAGES.index(stage):]:
        for name in MADE.get(redo, []):
            mark(d / name, False)
    if stage == 'researcher':
        (d / 'sites.json').unlink(missing_ok=True)  # a missing file is never checked(), whatever the ledger says
    if stage != 'art':
        (d / 'balance.json').unlink(missing_ok=True)


def agent(name, output, inputs, check, search=False, optional_pair=(), rests_on=()):
    """Runs one agent in an empty folder holding only its inputs. Returns once `check` finds no problems.
    `rests_on` names files the check reads that the agent doesn't get. The pass is recorded against them, the inputs and the agent's rules."""
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
            stop_on_codex_failure(getattr(r, 'returncode', 0), r.stdout + r.stderr)
            made = Path(work) / Path(output).name
            if made.exists():
                mark(output, False)  # before the copy: a run killed between copy and check redoes this stage
                shutil.copy(made, output)
            else:
                problems = f'{Path(output).name} was not written.'
                print(f'[{name}] no output. {r.stdout[-300:]}{r.stderr[-300:]}', flush=True)
                continue
        problems = check()
        if not problems:
            mark(output, True, [AGENTS / f'{name}.md', *(src for dest, src in inputs.items() if dest not in optional_pair), *rests_on])
            return
        print(f'[{name}] problems:\n{problems}', flush=True)
    Path(output).unlink(missing_ok=True)
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
            begin(d, 'researcher')
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
            mark(sites_file, True, [AGENTS / 'researcher.md', picks, *(ROOT / s['file'] for s in sites)])
        sites = json.loads(sites_file.read_text())['sites']

        if want('parser'):
            begin(d, 'parser')
            for i, s in enumerate(sites, 1):
                out_file = d / f'ideas-{i}.json'
                agent('parser', out_file, {'site.json': ROOT / s['file']}, lambda f=out_file, s=s: result(tool('tools/checks.ts', 'ideas', rel(f), s['file'])), rests_on=[sites_file])

        if want('storymaker'):
            begin(d, 'storymaker')
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
            agent('storymaker', content, inputs, check_content, rests_on=[sites_file])

        if want('gameplay'):
            begin(d, 'gameplay')
            report = d / 'balance.json'
            # Keep the whole retry sequence together so a resume can recover its last pair.
            tried, tried_report = d / 'assembly-tried.json', d / 'balance-tried.json'
            provenance = d / 'balance-tried-provenance.json'
            history = d / 'balance-history.json'
            pending = d / 'balance-pending.json'
            content_hash = hashlib.sha256(content.read_bytes()).hexdigest()

            def relevant(plan):
                # These are the only plan fields assemble() reads, including elite fields.
                return [{'packs': {band: act['packs'][band] for band in ('early', 'mid', 'late')},
                         'elites': [{'id': e['id'], 'reward': e['reward']} for e in act['elites']],
                         'shop': act['shop']} for act in plan['acts']]

            def evidence_error():
                sys.exit('Gameplay retry evidence is missing or mismatched. Restore the matching failed plan, full balance report and provenance for this content, or restart the gameplay sequence with verified evidence.')

            failed = []
            if history.exists():
                try:
                    state = json.loads(history.read_text())
                    if state['content'] != content_hash or not state['plans'] or not isinstance(state['report'], str) or not state['report']:
                        evidence_error()
                    failed = state['plans']
                    for plan in failed:
                        relevant(plan)
                    if pending.exists():
                        marker = json.loads(pending.read_text())
                        plan_hash = hashlib.sha256(json.dumps(failed[-1], sort_keys=True).encode()).hexdigest()
                        if marker != {'attempt': state.get('attempt'), 'content': content_hash, 'plan': plan_hash} or not isinstance(marker['attempt'], str) or not marker['attempt']:
                            evidence_error()
                    # The durable history is authoritative; reconstruct missing worker inputs.
                    for path, value in ((tried, json.dumps(failed[-1])), (tried_report, state['report'])):
                        if path.exists() and (json.loads(path.read_text()) != failed[-1] if path == tried else path.read_text() != value):
                            evidence_error()
                        path.write_text(value)
                    pending.unlink(missing_ok=True)
                except (OSError, ValueError, KeyError, TypeError):
                    evidence_error()
            elif pending.exists():
                evidence_error()
            elif any(p.exists() for p in (tried, tried_report, provenance)):
                # Accept the previous format only when its complete provenance still matches.
                try:
                    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (content, tried, tried_report)}
                    if json.loads(provenance.read_text()) != hashes:
                        evidence_error()
                    failed = [json.loads(tried.read_text())]
                    relevant(failed[0])
                    if not tried_report.read_text():
                        evidence_error()
                except (OSError, ValueError, KeyError, TypeError):
                    evidence_error()

            def check_plan():
                bad = result(tool('tools/checks.ts', 'assembly', rel(assembly), rel(content)))
                if bad:
                    return bad
                candidate = json.loads(assembly.read_text())
                if any(relevant(candidate) == relevant(plan) for plan in failed):
                    return 'Assembly is unchanged from a failed balance attempt; change the encounters or shop before retrying.'
                ok, out = tool('tools/build-run.ts', rel(d))
                if not ok:
                    return out
                report.unlink(missing_ok=True)
                attempt = uuid.uuid4().hex
                plan_hash = hashlib.sha256(json.dumps(candidate, sort_keys=True).encode()).hexdigest()
                pending.write_text(json.dumps({'attempt': attempt, 'content': content_hash, 'plan': plan_hash}))
                ok, out = tool('tools/balance.ts', f'public/runs/{run_id}/run.json', '--tune', '--report', rel(report))
                print(out, flush=True)
                if not ok:
                    if not report.is_file() or not report.read_text():
                        sys.exit('Balance failed without a full report. Restore the report for this attempt before resuming gameplay.')
                    failed.append(candidate)
                    state = {'content': content_hash, 'plans': failed, 'report': report.read_text(), 'attempt': attempt}
                    fresh = history.with_suffix('.tmp')
                    fresh.write_text(json.dumps(state))
                    # Remove the old pair first; either history can recreate its own pair.
                    tried.unlink(missing_ok=True)
                    tried_report.unlink(missing_ok=True)
                    os.replace(fresh, history)
                    tried.write_text(json.dumps(candidate))
                    tried_report.write_text(state['report'])
                    provenance.unlink(missing_ok=True)
                pending.unlink(missing_ok=True)
                if ok:
                    mark(report, True, [AGENTS / 'gameplay.md', *played(d)])
                return '' if ok else out

            agent('gameplay', assembly, {'content.json': content, 'library.json': library, 'last-assembly.json': tried, 'balance.json': tried_report}, check_plan, optional_pair=('last-assembly.json', 'balance.json'))
            tried.unlink(missing_ok=True)
            tried_report.unlink(missing_ok=True)
            provenance.unlink(missing_ok=True)
            history.unlink(missing_ok=True)
            pending.unlink(missing_ok=True)

        if want('art'):
            agent('art', brief, {'content.json': content}, lambda: '' if len(json.loads(brief.read_text()).get('acts', [])) == ACTS else f'Write {ACTS} acts.')
            if '--no-images' not in args:
                py = ROOT / 'factory/.venv/bin/python'
                if subprocess.run([py, ROOT / 'factory/art.py', run_id], cwd=ROOT, env=clean_env()).returncode:
                    sys.exit('Art failed. Stopping; nothing was opened.')
    print(f'Run {run_id} is ready. Open it with a reviewed PR.', flush=True)


if __name__ == '__main__':
    main()
