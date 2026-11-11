import { expect, it, vi } from 'vitest';
import { renderEventScene } from './event-scene';

it('renders event art and option buttons, preserving affordability and the chosen effect', () => {
  class Element {
    className = ''; textContent = ''; src = ''; alt = ''; type = ''; disabled = false;
    children: Element[] = []; click?: () => void;
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute() {} remove() {}
    addEventListener(_type: string, action: () => void) { this.click = action; }
  }
  vi.stubGlobal('document', { createElement: () => new Element() });
  try {
    const choose = vi.fn(), effect = { type: 'gold' as const, amount: -5 };
    const scene = renderEventScene({ title: 'Door', text: 'Choose', art: '/art/door.webp', options: [{ label: 'Pay', effect, result: 'Opened' }, { label: 'Leave', effect: { type: 'gold', amount: 0 }, result: 'Left' }] }, 2, choose) as unknown as Element;
    expect(scene.className).toBe('event-scene');
    expect(scene.children[0].src).toBe('/art/door.webp');
    const buttons = scene.children[2].children;
    expect(buttons.map(b => [b.className, b.disabled])).toEqual([['event-option', true], ['event-option', false]]);
    buttons[1].click!(); expect(choose).toHaveBeenCalledWith({ type: 'gold', amount: 0 }, 'Left');
  } finally { vi.unstubAllGlobals(); }
});
