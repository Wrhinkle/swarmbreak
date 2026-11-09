import { expect, it } from 'vitest';
import { atbTargets, chooseAtb, createCombat, enableAtb, setAutoBattle, step } from './combat';
import type { Creature } from './types';
import { loadSave, newSave, parseSave, writeSave } from './save';

it('keeps one animation loop when pause and resume happen before a frame', async () => {
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  const scheduled = new Map<number, FrameRequestCallback>(); let next = 0;
  globalThis.document = { querySelector: () => null } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  globalThis.requestAnimationFrame = callback => { scheduled.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => { scheduled.delete(id); };
  try {
    const { toggleFightPause } = await import('./main');
    const frame: FrameRequestCallback = () => {};
    let state = { paused: false, animation: requestAnimationFrame(frame) };
    state = toggleFightPause(state.paused, state.animation, frame);
    expect(scheduled.size).toBe(0);
    state = toggleFightPause(state.paused, state.animation, frame);
    expect(state.paused).toBe(false);
    expect([...scheduled.keys()]).toEqual([state.animation]);
  } finally {
    globalThis.document = oldDocument; globalThis.fetch = oldFetch;
    globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel;
  }
});

it('distinguishes the action gauges of fighters with the same name', async () => {
  class Element {
    children: Element[] = []; attributes: Record<string, string> = {}; max = 0; value = 0;
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderRoster } = await import('./main');
    const creature: Creature = { id: 'ally', name: 'Ally', blurb: '', sprite: '', bodyPlan: 'construct', role: 'bruiser', tier: 'ally', routines: ['strike'], source: '/' };
    const combat = createCombat([{ creature }, { creature }], [creature], 42);
    const roster = new Element();
    renderRoster(roster as unknown as HTMLElement, combat.fighters, combat.t);
    const group = roster.children[0];
    expect(group.children[2].attributes['aria-label']).toBe('Ally (1) action readiness');
    expect(group.children[4].attributes['aria-label']).toBe('Ally (2) action readiness');
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});

it('renders a ready fighter, records a selected target, and offers Auto after reload', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; type = ''; disabled = false;
    click?: () => void; focused = false;
    focus() { this.focused = true; }
    attributes: Record<string, string> = {};
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
    addEventListener(_name: string, handler: () => void) { this.click = handler; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = '';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderCombatDecision } = await import('./main');
    const creature = (id: string): Creature => ({ id, name: id, blurb: '', sprite: '', bodyPlan: 'construct', role: 'bruiser', tier: 'ally', routines: ['strike'], source: '/' });
    let combat = enableAtb(createCombat([{ creature: creature('Ally') }], [creature('First'), creature('Second')], 42));
    combat.fighters[0].nextAction = 1; combat.fighters.slice(1).forEach(f => f.nextAction = 100);
    combat = step(combat);
    const save = newSave();
    save.today = { runId: 'test', node: null, cleared: [], crew: [{ creature: creature('Ally'), hp: 40, routines: ['strike'], slots: 3, recruited: false, active: true }], deck: ['strike'], gold: 0, seed: 42, result: null, combat };
    writeSave(save);
    expect(parseSave(stored).today!.combat).toEqual(combat);
    combat = loadSave().today!.combat!;
    const panel = new Element(); let selected = '';
    const render = () => renderCombatDecision(panel as unknown as HTMLElement, combat, selected, id => { selected = id; render(); }, (id, target) => { combat = chooseAtb(combat, combat.atb!.pending!, id, target); selected = ''; render(); });
    render();
    expect(panel.attributes['aria-live']).toBe('polite');
    expect(panel.children[0].textContent).toBe('Ally is ready');
    panel.children[3].click?.();
    expect(atbTargets(combat, 'c0', 'strike').map(f => f.creature.name)).toEqual(['First', 'Second']);
    expect(panel.children[4].textContent).toBe('Choose a target for Strike');
    expect(panel.children[5].focused).toBe(true);
    // Copies of the same creature can have identical health, but still need distinct targets.
    combat.fighters[2].creature.name = 'First';
    combat.fighters[2].hp = combat.fighters[1].hp;
    render();
    expect(panel.children[5].textContent).toContain('First (1)');
    expect(panel.children[6].textContent).toContain('First (2)');
    panel.children[6].click?.();
    expect(combat.atb!.choices).toEqual([{ actorId: 'c0', routineId: 'strike', targetId: 'e1' }]);
    expect(panel.children).toHaveLength(0);
    save.today!.combat = combat; writeSave(save);
    expect(parseSave(stored).today!.combat).toEqual(combat);
    const reloaded = loadSave().today!.combat!;
    expect(step(reloaded)).toEqual(step(combat));
    combat = step(combat);
    while (!combat.result && !combat.atb!.pending) combat = step(combat);
    expect(combat.atb!.pending).toBe('c0');
    // Turning on Auto battle at a pending decision must persist both the toggle
    // and the recorded choice, so reloading cannot ask for that action again.
    const autoBattle = setAutoBattle(combat, true);
    save.today!.combat = autoBattle; writeSave(save);
    const reloadedAuto = loadSave().today!.combat!;
    expect(reloadedAuto.atb!.autoBattle).toBe(true);
    expect(reloadedAuto.atb!.pending).toBeNull();
    expect(reloadedAuto.atb!.choices.at(-1)).toEqual({ actorId: 'c0', routineId: 'auto' });
    expect(step(reloadedAuto)).toEqual(step(autoBattle));
    // Switching back to manual before the queued Auto action executes must
    // preserve that action, then ask for the next one after a reload.
    const manualAgain = setAutoBattle(reloadedAuto, false);
    save.today!.combat = manualAgain; writeSave(save);
    let resumed = step(loadSave().today!.combat!);
    expect(resumed.atb!.choices.at(-1)?.routineId).toBe('auto');
    expect(resumed.atb!.choice).toBeNull();
    expect(resumed.fighters[0].nextAction).toBeGreaterThan(resumed.t);
    while (!resumed.result && !resumed.atb!.pending) resumed = step(resumed);
    expect(resumed.atb!.pending).toBe('c0');
    render(); panel.children[2].click?.();
    expect(combat.atb!.choices.at(-1)?.routineId).toBe('auto');
    expect(setAutoBattle(combat, true).atb!.autoBattle).toBe(true);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

it('keeps focused decision controls when the same paused fight is rendered again', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; type = ''; disabled = false;
    attributes: Record<string, string> = {}; focused = false; click?: () => void;
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
    addEventListener(_name: string, handler: () => void) { this.click = handler; }
    focus() { this.focused = true; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { createCombatDecisionRenderer } = await import('./main');
    const creature = (id: string): Creature => ({ id, name: id, blurb: '', sprite: '', bodyPlan: 'construct', role: 'bruiser', tier: 'ally', routines: ['strike'], source: '/' });
    let combat = enableAtb(createCombat([{ creature: creature('Ally') }], [creature('Enemy')], 42));
    combat.fighters[0].nextAction = 1;
    combat = step(combat);
    const panel = new Element();
    const render = createCombatDecisionRenderer(panel as unknown as HTMLElement);
    render(combat, 'strike', () => {}, () => {});
    const target = panel.children[5];
    expect(target.focused).toBe(true);
    render(combat, 'strike', () => {}, () => {});
    expect(panel.children[5]).toBe(target);
    render(structuredClone(combat), 'strike', () => {}, () => {});
    expect(panel.children[5]).not.toBe(target);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});

it('reloads between two crew decisions in the same tick and records the second target', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; type = ''; disabled = false;
    click?: () => void;
    setAttribute(_name: string, _value: string) {}
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
    addEventListener(_name: string, handler: () => void) { this.click = handler; }
    focus() {}
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = '';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } } });
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderCombatDecision } = await import('./main');
    const creature = (id: string): Creature => ({ id, name: id, blurb: '', sprite: '', bodyPlan: 'construct', role: 'bruiser', tier: 'ally', routines: ['strike'], source: '/' });
    const ally = creature('Ally'), enemy = creature('Enemy');
    let combat = enableAtb(createCombat([{ creature: ally }, { creature: ally }], [enemy, enemy], 42));
    combat.fighters.slice(0, 2).forEach(f => { f.nextAction = 1; });
    combat.fighters.slice(2).forEach(f => { f.nextAction = 100; });
    combat = step(combat);
    expect(combat.atb!.pending).toBe('c0');
    combat = step(chooseAtb(combat, 'c0', 'auto'));
    expect(combat.atb!.pending).toBe('c1');
    const save = newSave();
    save.today = { runId: 'test', node: null, cleared: [], crew: [0, 1].map(() => ({ creature: ally, hp: 40, routines: ['strike'], slots: 3, recruited: false, active: true })), deck: ['strike'], gold: 0, seed: 42, result: null, combat };
    writeSave(save);
    combat = loadSave().today!.combat!;
    expect(combat.atb!.choices).toEqual([{ actorId: 'c0', routineId: 'auto' }]);
    const panel = new Element(); let selected = '';
    const render = () => renderCombatDecision(panel as unknown as HTMLElement, combat, selected, id => { selected = id; render(); }, (id, target) => { combat = chooseAtb(combat, combat.atb!.pending!, id, target); selected = ''; render(); });
    render();
    expect(panel.children[0].textContent).toBe('Ally (2) is ready');
    panel.children[3].click?.();
    panel.children[6].click?.();
    expect(combat.atb!.choices).toEqual([{ actorId: 'c0', routineId: 'auto' }, { actorId: 'c1', routineId: 'strike', targetId: 'e1' }]);
    save.today!.combat = combat; writeSave(save);
    expect(step(loadSave().today!.combat!)).toEqual(step(combat));
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
