// Host screen check. Serves a built site, opens it in headless Chrome at a phone and a desktop size, visits each
// screen, saves a screenshot and prints what it measured as JSON. factory/pr_team.py decides what to refuse.
// No dependencies: Chrome's DevTools protocol over Node's own WebSocket.
// The page is code an agent wrote. Chrome gets a fresh profile and sends every request, loopback included, to the
// server below, which answers only for http://game.test from the built folder. So the page can't reach the network
// or another service on this machine. WebRTC would send UDP past a proxy, so it is held to the proxy too, and the
// server refuses the CONNECT it then tries. The host reads the manifest and the run itself, and only inside the build.
// It reaches a room by writing the room id to `today.pending` in the save and pressing Continue, then checks the page's
// main heading is that room's label, so a screenshot is never of some other screen. A change to the save key, to the
// Play, Continue or Crew buttons, or to the room heading needs this file changed first in its own PR: the host runs its
// own copy, never the one in the tree under review.
// usage: node screens.mjs <chrome> <dist> <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, sep } from 'node:path';

const [exe, dist, out] = process.argv.slice(2);
const KEY = 'swarmbreak-save-v1', SITE = 'http://game.test/';
const SIZES = [[390, 844], [1280, 800]], ROOMS = ['fight', 'shop', 'treasure', 'event', 'rest'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const root = realpathSync(dist);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// A file of the build. A symlink or a `..` in a path the build names must not make the host read anything else.
const inside = path => {
  const file = realpathSync(join(root, path));
  if (!file.startsWith(root + sep)) throw new Error(`${path} is outside the built folder`);
  return file;
};
let acts; // read before the browser starts, so a build that points outside itself opens nothing
try {
  const manifest = JSON.parse(readFileSync(inside('manifest.json')));
  // The page plays the next run once it has opened (currentRun in src/save.ts). Room ids must come from the same run.
  const live = manifest.next && Date.parse(manifest.next.opensAt) <= Date.now() ? manifest.next : manifest;
  acts = JSON.parse(readFileSync(inside(live.runUrl))).acts;
} catch (e) { console.error(String(e.message ?? e)); process.exit(1); }

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, SITE);
    if (url.origin + '/' !== SITE) throw new Error('not the game');
    const file = inside(url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));

const profile = mkdtempSync(join(tmpdir(), 'screens-'));
const chrome = spawn(exe, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--proxy-server=http://127.0.0.1:${server.address().port}`,
  '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
// Chrome can still be writing to the profile when it is removed, which fails the removal with ENOTEMPTY. Node retries that.
const stop = () => { chrome.kill('SIGKILL'); rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); };
setTimeout(() => { console.error('timed out after 120 s'); stop(); process.exit(1); }, 120_000).unref(); // a page that hangs must not leave Chrome running
let code = 0;
try {
  const wsUrl = await new Promise((ok, no) => {
    let err = '';
    chrome.stderr.on('data', d => { err += d; const m = err.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
    chrome.on('error', e => no(new Error(`Could not start Chrome ${exe}: ${e.message}`)));
    chrome.on('exit', c => no(new Error(`Chrome exited ${c}: ${err.slice(-300)}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('no DevTools connection')); });
  let seq = 0, errors = [];
  const waiting = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const [ok, no] = waiting.get(m.id); waiting.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params, sessionId) => new Promise((ok, no) => { waiting.set(++seq, [ok, no]); ws.send(JSON.stringify({ id: seq, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const js = async (fn, ...args) => {
    const r = await cdp('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  // Presses the first visible button whose text matches. Retries while the page is still loading.
  const press = async pattern => {
    for (let i = 0; i < 100; i++) {
      const hit = await js(p => { const b = [...document.querySelectorAll('button')].find(b => b.checkVisibility() && new RegExp(p, 'i').test(b.textContent.trim())); b?.click(); return !!b; }, pattern).catch(() => false);
      if (hit) return;
      await sleep(100);
    }
    throw new Error(`no visible button matching ${pattern}`);
  };
  const shots = [];
  mkdirSync(out, { recursive: true });
  for (const [width, height] of SIZES) {
    const shot = async screen => {
      await sleep(600); // room entry and card animations
      writeFileSync(join(out, `${screen}-${width}.png`), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      shots.push({ screen, width, errors: errors.splice(0), ...await js(() => ({
        selects: document.querySelectorAll('select').length, scrollWidth: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll('button')].filter(b => b.checkVisibility()).map(b => [b.textContent.trim().slice(0, 40), b.offsetWidth, b.offsetHeight]),
      })) });
    };
    // Reopens the game at a room of this run, or at the map when `kind` is empty.
    const resume = async kind => {
      const act = kind ? acts.findIndex(a => a.nodes.some(n => n.kind === kind)) : 0;
      if (act < 0) return false;
      const node = kind ? acts[act].nodes.find(n => n.kind === kind) : null;
      // A fight on the page saves on every tick. Once the save is edited, the page being left may not write over it.
      await js((k, act, pending) => { const s = JSON.parse(localStorage.getItem(k)); Object.assign(s.today, { act, pending, gold: 200 }); localStorage.setItem(k, JSON.stringify(s)); Storage.prototype.setItem = () => {}; },
        KEY, act, node?.id ?? null);
      await cdp('Page.navigate', { url: SITE });
      await press('^Continue$');
      const title = node && await js(() => document.querySelector('[role=heading][aria-level="1"]')?.textContent ?? '');
      if (node && title !== node.label) throw new Error(`asked for the ${kind} room "${node.label}", the page shows "${title}"`);
      return true;
    };
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: SITE });
    await js(() => localStorage.clear()).catch(() => {});
    await cdp('Page.navigate', { url: SITE });
    await press('^Play$');
    for (const title of ['The daily run', 'Choose your route', 'Your crew', 'In a fight', 'Give an order', 'Bring an ally home']) {
      const shown = await js(() => document.querySelector('.walkthrough h1')?.textContent);
      if (shown !== title) throw new Error(`expected walkthrough step "${title}", got "${shown}"`);
      await press(title === 'Bring an ally home' ? '^Finish$' : '^Next$');
    }
    await shot('map');
    const firstFight = acts[0].nodes.find(n => n.floor === 0 && n.kind === 'fight' && !n.hidden);
    if (!firstFight) throw new Error('no visible first-floor fight to test');
    const entered = await js(label => { const b = [...document.querySelectorAll('button.route')].find(b => b.textContent.includes(label)); b?.click(); return !!b; }, firstFight.label);
    if (!entered) throw new Error(`first-floor fight "${firstFight.label}" is not reachable`);
    await press('^Pause$');
    await press('^Resume$');
    await sleep(600); // allow the fight animation and simulation to run
    await press('^Pause$');
    const fight = await js(() => ({ canvas: !!document.querySelector('canvas[aria-label^="Fight:"]'),
      crew: !![...document.querySelectorAll('legend')].find(e => e.textContent === 'Order a crew member'),
      routine: !![...document.querySelectorAll('legend')].find(e => e.textContent === 'Manual routine'),
      queue: !![...document.querySelectorAll('button')].find(b => b.textContent === 'Queue order' && b.checkVisibility()) }));
    if (!Object.values(fight).every(Boolean)) throw new Error(`first fight controls missing: ${JSON.stringify(fight)}`);
    await shot('fresh-fight');
    for (const kind of ROOMS) if (await resume(kind)) await shot(kind); else shots.push({ screen: kind, width, missing: true });
    await resume(''); await press('crew'); await shot('crew');
    await js(() => localStorage.clear());
    await cdp('Page.navigate', { url: SITE });
    await js(() => new Promise(r => setTimeout(r, 300))).catch(() => {});
    await shot('title');
  }
  console.log(JSON.stringify(shots));
  const pageErrors = shots.flatMap(s => (s.errors ?? []).map(error => `${s.screen} at ${s.width}px: ${error}`));
  if (pageErrors.length) { console.error(pageErrors.join('\n')); code = 1; }
} catch (e) {
  console.error(String(e.message ?? e));
  code = 1;
} finally {
  server.close(); chrome.kill();
  await sleep(200); // Chrome is still writing to the profile as it exits
  stop();
}
process.exit(code);
