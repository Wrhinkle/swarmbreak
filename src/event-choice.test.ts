import { expect, it, vi } from 'vitest';

it('describes the effect, invokes an available choice, and explains an unaffordable choice', async () => {
  class Element {
    textContent = ''; className = ''; type = ''; disabled = false; attributes: Record<string, string> = {}; handler?: () => void;
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(_type: string, handler: () => void) { this.handler = handler; }
    click() { if (!this.disabled) this.handler?.(); }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { eventChoice } = await import('./main');
    const choose = vi.fn();
    const heal = eventChoice('Mend', { type: 'heal', amount: .2 }, 10, choose) as unknown as Element;
    expect(heal.textContent).toContain('Heal each crew member');
    expect(heal.textContent).toContain('20%');
    heal.click(); expect(choose).toHaveBeenCalledOnce();
    const cost = eventChoice('Pay', { type: 'gold', amount: -25 }, 10, choose) as unknown as Element;
    expect(cost.disabled).toBe(false);
    expect(cost.attributes['aria-disabled']).toBe('true');
    expect(cost.textContent).toContain('25 gold');
    expect(cost.textContent).toContain('Not enough gold');
    cost.click(); expect(choose).toHaveBeenCalledOnce();
    expect((eventChoice('Learn', { type: 'routine', id: 'patch' }, 10, choose) as unknown as Element).textContent).toContain('Patch');
    expect((eventChoice('Leave', { type: 'nothing' }, 10, choose) as unknown as Element).textContent).toContain('No effect');
    expect((eventChoice('Hurt', { type: 'damage', amount: .1 }, 10, choose) as unknown as Element).textContent).toContain('10%');
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
