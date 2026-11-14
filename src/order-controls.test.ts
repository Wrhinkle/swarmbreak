import { expect, it, vi } from 'vitest';
import { orderSelectors } from './order-controls';

it('cycles choices without replacing the focused button and queues the selected order', () => {
  class Element {
    children: Element[] = []; textContent = ''; className = ''; type = ''; id = ''; disabled = false;
    attributes: Record<string, string> = {}; listeners: Record<string, () => void> = {};
    constructor(public tag: string) {}
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...items: Element[]) { this.children.push(...items); }
    addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  }
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) });
  try {
    const queue = vi.fn();
    const group = orderSelectors([
      { id: 'a', name: 'A', routines: [{ id: 'one', label: 'One' }] },
      { id: 'b', name: 'B', routines: [{ id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }] },
      { id: 'c', name: 'C', routines: [{ id: 'four', label: 'Four' }, { id: 'three', label: 'Three' }] },
    ], queue, () => ({ cooldown: 0, queued: null, result: null, fighters: [{ id: 'a', hp: 1 }, { id: 'b', hp: 1 }, { id: 'c', hp: 1 }] })).element as unknown as Element;
    const [crewField, routineField, button, limitation] = group.children;
    expect(limitation.textContent).toContain('shared cooldown');
    const crew = crewField.children[1], routine = routineField.children[1];
    expect(crew.tag).toBe('button'); expect(routine.tag).toBe('button');
    expect(routine.textContent).toBe('One');
    crew.listeners.click();
    expect(crewField.children[1]).toBe(crew);
    expect(routine.textContent).toBe('Two');
    routine.listeners.click(); button.listeners.click();
    expect(queue).toHaveBeenCalledWith('b', 'three');
    crew.listeners.click();
    expect(routine.textContent).toBe('Three');
    expect(crew.attributes['aria-label']).toContain('C');
  } finally { vi.unstubAllGlobals(); }
});

 it('shows the cooldown cost and explains unavailable orders beside the control', () => {
  class Element {
    children: Element[] = []; className = ''; type = ''; id = ''; disabled = false;
    private text = ''; writes = 0;
    get textContent() { return this.text; }
    set textContent(value: string) { this.text = value; this.writes++; }
    attributes: Record<string, string> = {}; listeners: Record<string, () => void> = {};
    constructor(public tag: string) {}
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...items: Element[]) { this.children.push(...items); }
    addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  }
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) });
  try {
    const state = { cooldown: 0, queued: null as null | { actorId: string }, result: null as null | 'win', fighters: [{ id: 'a', hp: 10 }, { id: 'b', hp: 0 }] };
    const queue = vi.fn((actorId: string) => { state.queued = { actorId }; });
    const controls = orderSelectors([{ id: 'a', name: 'A', routines: [{ id: 'one', label: 'One' }] }, { id: 'b', name: 'B', routines: [{ id: 'one', label: 'One' }] }], queue, () => state);
    const group = controls.element as unknown as Element;
    const [crewField, , button, limitation, status] = group.children;
    expect(limitation.textContent).toMatch(/shared.*4 seconds.*1×/i);
    expect(status.attributes.role).toBe('status');
    expect(button.attributes['aria-describedby']).toBe(status.id);
    expect(status.textContent).toBe('Order ready.');
    const writes = status.writes;
    controls.update(); controls.update();
    expect(status.writes).toBe(writes);
    expect(button.disabled).toBe(false);
    button.listeners.click(); controls.update();
    expect(queue).toHaveBeenCalledWith('a', 'one');
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/queued/i);
    state.queued = null; state.cooldown = 7; controls.update();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/cooldown/i);
    state.cooldown = 0; crewField.children[1].listeners.click();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/down/i);
    crewField.children[1].listeners.click();
    expect(button.disabled).toBe(false); expect(status.textContent).toBe('Order ready.');
    button.listeners.click(); controls.update();
    expect(queue).toHaveBeenCalledTimes(2);
    expect(status.textContent).toMatch(/queued/i);
    state.queued = null;
    state.result = 'win'; controls.update();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/ended/i);
  } finally { vi.unstubAllGlobals(); }
});

it('announces accepted and rejected orders, including replacing a fallen fighter’s order', async () => {
  const { createCombat, step } = await import('./combat');
  const { submitOrder } = await import('./order-controls');
  const creature = (id: string): import('./types').Creature => ({ id, name: id, blurb: '', sprite: '', bodyPlan: 'construct', role: 'bruiser', tier: 'ally', routines: ['strike'], source: '/' });
  let state = createCombat([{ creature: creature('a') }, { creature: creature('b') }], [creature('enemy')], 1);
  let result = submitOrder(state, 'c0', 'strike');
  expect(result.message).toBe('Order queued.');
  result = submitOrder(result.state, 'c1', 'strike');
  expect(result.message).toBe('Order unavailable.');
  state = result.state;
  state.fighters[0].hp = 0;
  result = submitOrder(state, 'c1', 'strike');
  expect(result.state.queued).toEqual({ actorId: 'c1', routineId: 'strike' });
  expect(result.message).toBe('Order queued.');
  state = result.state;
  state.fighters[1].nextAction = 1;
  state = step(state);
  expect(submitOrder(state, 'c1', 'strike').message).toBe('Order unavailable.');
});
