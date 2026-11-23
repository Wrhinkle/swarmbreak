import { expect, it } from 'vitest';
import { ROUTINES } from './library';

it('shows reward effects and confirms only the selected reward', async () => {
  class Element {
    textContent = ''; className = ''; type = ''; disabled = false;
    children: Element[] = []; attributes: Record<string, string> = {}; handler?: () => void;
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(_type: string, handler: () => void) { this.handler = handler; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { treasureChoices } = await import('./main');
    let gold = 0, routine = 0;
    const group = treasureChoices(ROUTINES.patch, () => gold++, () => routine++) as unknown as Element;
    const goldCard = group.children[0], routineCard = group.children[1], confirm = group.children[2];
    expect(goldCard.children[1].children[2].textContent).toContain('40 gold');
    expect(routineCard.children[1].children[2].textContent).toContain('If an ally is under 50% HP: Patch');
    expect(confirm.disabled).toBe(true);
    goldCard.children[2].handler?.();
    expect(goldCard.children[2].attributes['aria-pressed']).toBe('true');
    expect(goldCard.children[2].textContent).toContain('Selected');
    routineCard.children[2].handler?.();
    expect(goldCard.children[2].attributes['aria-pressed']).toBe('false');
    expect(routineCard.children[2].attributes['aria-pressed']).toBe('true');
    expect(confirm.textContent).toContain('Patch');
    expect([gold, routine]).toEqual([0, 0]);
    confirm.handler?.();
    expect([gold, routine]).toEqual([0, 1]);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
