import { expect, it, vi } from 'vitest';
import { orderSelectors } from './order-controls';

it('cycles choices without replacing the focused button and queues the selected order', () => {
  class Element {
    children: Element[] = []; textContent = ''; className = ''; type = ''; disabled = false;
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
    children: Element[] = []; textContent = ''; className = ''; type = ''; disabled = false;
    attributes: Record<string, string> = {}; listeners: Record<string, () => void> = {};
    constructor(public tag: string) {}
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...items: Element[]) { this.children.push(...items); }
    addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  }
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) });
  try {
    const state = { cooldown: 0, queued: null as null | { actorId: string }, result: null as null | 'win', fighters: [{ id: 'a', hp: 10 }, { id: 'b', hp: 0 }] };
    const controls = orderSelectors([{ id: 'a', name: 'A', routines: [{ id: 'one', label: 'One' }] }, { id: 'b', name: 'B', routines: [{ id: 'one', label: 'One' }] }], vi.fn(), () => state);
    const group = controls.element as unknown as Element;
    const [crewField, , button, limitation, status] = group.children;
    expect(limitation.textContent).toMatch(/shared.*4 seconds.*1×/i);
    expect(button.disabled).toBe(false);
    state.queued = { actorId: 'a' }; controls.update();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/queued/i);
    state.queued = null; state.cooldown = 7; controls.update();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/cooldown/i);
    state.cooldown = 0; crewField.children[1].listeners.click();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/down/i);
    crewField.children[1].listeners.click(); state.result = 'win'; controls.update();
    expect(button.disabled).toBe(true); expect(status.textContent).toMatch(/ended/i);
  } finally { vi.unstubAllGlobals(); }
});
