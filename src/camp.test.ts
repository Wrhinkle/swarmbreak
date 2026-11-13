import { expect, it, vi } from 'vitest';

it('explains an empty camp and returns to the title, while retaining populated camp cards', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; type = ''; disabled = false; src = ''; alt = '';
    style = { setProperty() {} }; dataset: Record<string, string> = {}; click?: () => void;
    append(...children: (Element | string)[]) { this.children.push(...children.filter((c): c is Element => typeof c !== 'string')); }
    replaceChildren(...children: Element[]) { this.children = children; }
    setAttribute() {}
    addEventListener(_name: string, handler: () => void) { this.click = handler; }
  }
  const root = new Element(), live = new Element();
  const oldDocument = globalThis.document, oldImage = globalThis.Image;
  const oldStorage = globalThis.localStorage;
  const creature = { id: 'ally', name: 'Ally', blurb: 'A friend', sprite: '', source: '', bodyPlan: 'beast', role: 'bruiser', tier: 'regular', routines: [] };
  let stored = '';
  globalThis.document = { querySelector: (s: string) => s === '#app' ? root : live, createElement: () => new Element() } as unknown as Document;
  globalThis.Image = class {} as typeof Image;
  globalThis.localStorage = { getItem: () => stored || null, setItem: (_k: string, v: string) => { if (v.includes('"camp"')) stored = v; } } as unknown as Storage;

  vi.useFakeTimers();
  vi.doMock('./live-run', () => ({ loadManifest: async () => ({ runId: 'today', opensAt: '2020-01-01', nextOpensAt: '2099-01-01', voided: [] }), loadRun: async () => ({ id: 'today', title: 'Run', swarm: { name: 'Swarm', blurb: '' }, acts: [{ creatures: [], site: { name: 'Site', url: '', note: '' } }], crew: [] }) }));
  const find = (node: Element, text: string): Element | undefined => node.textContent === text ? node : node.children.map(c => find(c, text)).find(Boolean);
  try {
    vi.resetModules();
    await import('./main');
    await Promise.resolve();
    await Promise.resolve();
    expect(find(root, 'Camp · 0')).toBeTruthy();
    find(root, 'Camp · 0')!.click!();
    expect(find(root, 'Your camp is quiet. Recruit an ally and win a run to bring one home.')).toBeTruthy();
    expect(find(root, 'Back to title')).toBeTruthy();
    find(root, 'Back to title')!.click!();
    expect(find(root, 'Camp · 0')).toBeTruthy();
    // A released save with an ally still renders the ally after a fresh load.
    stored = JSON.stringify({ version: 1, camp: [{ ally: creature, runId: 'earlier', wonAt: '2026-01-01', sites: ['Site'] }], today: null, results: {} });
    vi.resetModules();
    await import('./main');
    await vi.waitFor(() => expect(find(root, 'Camp · 1')).toBeTruthy());
    find(root, 'Camp · 1')!.click!();
    expect(find(root, 'Ally')).toBeTruthy();
    expect(find(root, 'Bring on next run')).toBeTruthy();
    expect(find(root, 'Back to title')).toBeTruthy();
  } finally {
    vi.useRealTimers(); vi.doUnmock('./live-run');
    globalThis.document = oldDocument; globalThis.Image = oldImage; globalThis.localStorage = oldStorage;
  }
});
