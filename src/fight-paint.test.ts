import { expect, it, vi } from 'vitest';
import { fightPaint } from './fight-paint';

it('skips phone painting and repaints on return to desktop, even without a frame', () => {
  let onChange = () => {};
  const media = { matches: true, addEventListener: vi.fn((_event, listener) => { onChange = listener; }), removeEventListener: vi.fn() };
  const draw = vi.fn();
  const { paint, cleanup } = fightPaint(media as unknown as MediaQueryList, draw);
  paint(); onChange();
  expect(draw).not.toHaveBeenCalled();
  media.matches = false;
  onChange();
  paint();
  expect(draw).toHaveBeenCalledTimes(2);
  cleanup();
  expect(media.removeEventListener).toHaveBeenCalledWith('change', onChange);
});
