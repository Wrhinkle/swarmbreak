import { expect, it, vi } from 'vitest';
import { fightPause } from './fight-pause';

it('shows and announces the current state immediately on each activation', () => {
  class Element {
    textContent = ''; type = ''; dataset: Record<string, string> = {};
    attributes: Record<string, string> = {}; listeners: Record<string, () => void> = {};
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(name: string, fn: () => void) { this.listeners[name] = fn; }
  }
  vi.stubGlobal('document', { createElement: () => new Element() });
  try {
    const changed = vi.fn();
    const { button, status } = fightPause(changed) as unknown as { button: Element; status: Element };
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Pause'); expect(status.textContent).toBe('Fight running');
    expect(status.attributes.role).toBe('status');
    button.listeners.click();
    expect(changed).toHaveBeenLastCalledWith(true);
    expect(button.textContent).toBe('Resume'); expect(status.textContent).toBe('Fight paused');
    button.listeners.click();
    expect(changed).toHaveBeenLastCalledWith(false);
    expect(button.textContent).toBe('Pause'); expect(status.textContent).toBe('Fight running');
  } finally { vi.unstubAllGlobals(); }
});
