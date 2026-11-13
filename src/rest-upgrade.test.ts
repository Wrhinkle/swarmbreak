import { expect, it, vi } from 'vitest';
import { ROUTINES } from './library';

it('shows both actual routine effects on the upgrade choice and invokes its action', async () => {
  class Element {
    textContent = ''; className = ''; type = ''; disabled = false;
    children: Element[] = []; handler?: () => void;
    append(...children: Element[]) { this.children.push(...children); }
    addEventListener(_type: string, handler: () => void) { this.handler = handler; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { restUpgradeChoice } = await import('./main');
    const choose = vi.fn();
    const button = restUpgradeChoice('Scout', ROUTINES.patch, choose) as unknown as Element;
    expect(button.textContent).toContain('Scout');
    expect(button.textContent).toContain('Patch');
    expect(button.textContent).toContain('If an ally is under 50% HP: Patch');
    expect(button.textContent).toContain('Early Patch');
    expect(button.textContent).toContain('If an ally is under 75% HP: Patch');
    button.handler?.();
    expect(choose).toHaveBeenCalledOnce();
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
