#!/usr/bin/env python3
"""Makes one day's images through Codex's built-in image tool, cuts sheets, and compresses them into public/art/<id>/.

Usage: factory/.venv/bin/python factory/art.py <run-id> [only-id ...]
Finished PNGs stay in runs/.art/<id>/, so a rerun only makes what's missing.
"""
import concurrent.futures as cf, json, os, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CUTTER = ROOT / 'factory/vendor/sprite-forge/generate2dsprite.py'
STYLE = 'Style: cut-paper diorama of layered construction paper with visible paper grain, flat colors, crisp hand-cut edges, small brass pins at joints, lit like a shadow theatre. No logos, no readable text, no numbers, no real people.'
KEYS = {'magenta': ('magenta #FF00FF', (255, 0, 255)), 'green': ('green #00FF00', (0, 255, 0))}
PARASITE = ', with a few small glowing teal hexagonal parasite nodes growing on it'
SIZES = {'map': (900, 1500, 72), 'backdrop': (1200, 800, 62), 'event': (720, 480, 72), 'boss': (900, 900, 80)}


def sheet_prompt(c, palette):
    key = KEYS[c.get('key', 'magenta')][0]
    facing = 'right' if c['tier'] == 'ally' else 'left'
    who = c['look'] + ('' if c['tier'] == 'ally' else PARASITE)
    return f"A video game animation sprite sheet of one creature: {who}. Palette: {palette}. {STYLE} The sheet is an exact grid of 6 columns and 4 rows of equal square cells, 24 frames, with the same subject, size, design, and colors, side view facing {facing}, in every frame. The subject fills at most 60 percent of its cell's width and height in every frame, including the biggest lunge and recoil, centered, so a wide empty margin surrounds it and nothing crosses a cell edge. Row 1: idle loop. Row 2: attack, wind-up, strike, recover. Row 3: hit reaction, recoil and return. Row 4: death, collapses, breaks into paper scraps, then specks scatter. Background is one perfectly flat solid {key} everywhere, with no gridlines, ground, shadow, or borders."


def jobs(content, brief):
    out = []
    for a, b in zip(content['acts'], brief['acts']):
        i = content['acts'].index(a)
        palette = b['palette']
        out.append(dict(id=f'map-{i}', kind='map', prompt=f"A tall vertical 2:3 illustration. {b['map']} Palette: {palette}. {STYLE} Fill the whole image."))
        for j, text in enumerate(b['backdrops']):
            out.append(dict(id=f'backdrop-{i}-{j}', kind='backdrop', prompt=f'A wide 3:2 background with no characters. {text} Palette: {palette}. {STYLE} Muted and low in contrast. Fill the whole image.'))
        for c in a['creatures']:
            if c['tier'] == 'boss':
                key = c.get('key', 'magenta')
                out.append(dict(id=c['id'], kind='boss', key=key, prompt=f"A single large full-body enemy boss, side view facing left: {c['look']}{PARASITE}. {b['boss']} Palette: {palette}. {STYLE} Square image, subject fills about 80 percent of it with nothing touching the edges. Background is one perfectly flat solid {KEYS[key][0]} everywhere, with no ground or shadow."))
            else:
                out.append(dict(id=c['id'], kind='sheet', key=c.get('key', 'magenta'), prompt=sheet_prompt(c, palette)))
        for e in a['events']:
            out.append(dict(id=e['id'], kind='event', prompt=f"A wide 3:2 storybook illustration: {e['look']} Palette: {palette}. {STYLE} Fill the whole image."))
    return out


def generate(job, work):
    png = work / f"{job['id']}.png"
    if png.exists():
        return png
    ask = f"Use the built-in image_gen tool once, with no text labels in the image, then copy the generated PNG from $CODEX_HOME/generated_images to ./{png.name} in the current directory. Do not use the CLI fallback or any API key. Do not write any other files.\n\nImage prompt: {job['prompt']}"
    env = {k: v for k, v in os.environ.items() if not k.endswith(('_API_KEY', '_AUTH_TOKEN', '_BASE_URL'))}
    for _ in range(2):
        try:
            with open(work / f"{job['id']}.log", 'w') as log:
                subprocess.run(['codex', 'exec', '-m', 'gpt-6.1-terra', '-c', 'model_reasoning_effort="low"', '-s', 'workspace-write', '--skip-git-repo-check', '-C', work, ask], stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, timeout=420, env=env)
        except subprocess.TimeoutExpired:
            pass
        if png.exists():
            return png
    return None


def key_out(im, rgb):
    """Fades pixels near the key colour to clear and removes its tint from the edges."""
    a = np.asarray(im.convert('RGB')).astype(float)
    dist = np.linalg.norm(a - np.array(rgb), axis=2)
    alpha = np.clip((dist - 60) / 90, 0, 1)
    if rgb == (255, 0, 255):
        a[..., 0] = np.minimum(a[..., 0], a[..., 1] + 120 * alpha + 40)
        a[..., 2] = np.minimum(a[..., 2], a[..., 1] + 120 * alpha + 40)
    else:
        a[..., 1] = np.minimum(a[..., 1], np.maximum(a[..., 0], a[..., 2]) + 40)
    return Image.fromarray(np.dstack([a, alpha * 255]).astype('uint8'), 'RGBA')


def clipped(sheet):
    """Share of frames with solid pixels against a cell edge, which means a limb was cut off."""
    a = np.asarray(sheet.convert('RGBA'))[..., 3] > 128
    h, w = a.shape[0] // 4, a.shape[1] // 6
    cells = [a[r * h:(r + 1) * h, c * w:(c + 1) * w] for r in range(3) for c in range(6)]
    return sum(c[0].sum() + c[-1].sum() + c[:, 0].sum() + c[:, -1].sum() > 6 for c in cells) / len(cells)


def finish(job, png, work, out):
    dest = out / f"{job['id']}.webp"
    if job['kind'] == 'sheet':
        cut = work / 'cut' / job['id']
        subprocess.run([sys.executable, CUTTER, 'process', '--input', png, '--target', 'creature', '--mode', 'idle', '--rows', '4', '--cols', '6', '--background-mode', 'chroma_key', '--key', job['key'], '--key-quality', 'auto', '--resampler', 'lanczos', '--scale-strategy', 'preserve', '--shared-scale', '--anchor-mode', 'center', '--align', 'center', '--grid-rounding', 'nearest', '--cell-size', '340', '--output-dir', cut], capture_output=True)
        sheet = Image.open(cut / 'sheet-transparent.png').convert('RGBA')
        share = clipped(sheet)
        if share > .25:
            return f'{share:.0%} of frames are clipped'
        sheet.resize((1200, 800), Image.LANCZOS).save(dest, 'WEBP', quality=75, method=6)
    else:
        w, h, q = SIZES[job['kind']]
        im = Image.open(png)
        im = key_out(im, KEYS[job['key']][1]) if job['kind'] == 'boss' else im.convert('RGB')
        im.resize((w, h), Image.LANCZOS).save(dest, 'WEBP', quality=q, method=6)
    return ''


def main():
    run_id, only = sys.argv[1], set(sys.argv[2:])
    d = ROOT / 'runs' / run_id
    content, brief = json.loads((d / 'content.json').read_text()), json.loads((d / 'art-brief.json').read_text())
    work, out = (ROOT / 'runs/.art' / run_id).resolve(), ROOT / 'public/art' / run_id
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    todo = [j for j in jobs(content, brief) if (j['id'] in only if only else not (out / f"{j['id']}.webp").exists())]
    print(f'{len(todo)} images to make', flush=True)

    def one(job):
        for attempt in range(3):
            png = generate(job, work)
            if not png:
                return job['id'], 'generation failed'
            why = finish(job, png, work, out)
            if not why:
                return job['id'], ''
            print(f"{job['id']}: {why}, regenerating", flush=True)
            png.unlink()
        return job['id'], why

    with cf.ThreadPoolExecutor(4) as ex:
        failed = [(i, w) for i, w in ex.map(one, todo) if w]
    size = sum(p.stat().st_size for p in out.glob('*.webp'))
    print(f'{len(list(out.glob("*.webp")))} images, {size // 1024} KB. Failed: {failed or "none"}', flush=True)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
