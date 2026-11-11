import { expect, it, vi } from 'vitest';
import { replaceOptions } from './option-focus';

it('keeps keyboard focus on the chosen option after its controls are rebuilt', () => {
  const focus = vi.fn();
  const previous = {};
  vi.stubGlobal('document', { activeElement: previous });
  const group = {
    querySelectorAll: vi.fn().mockReturnValueOnce([{}, previous]).mockReturnValueOnce([{}, { focus }]),
    replaceChildren: vi.fn(),
  };
  try {
    replaceOptions(group as unknown as HTMLElement, []);
    expect(focus).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
