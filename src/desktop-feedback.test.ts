import { expect, it, vi } from 'vitest';
import { addFeedback, drawFeedback } from './desktop-feedback';
import type { CombatState } from './combat';

it('shows each new impact once, separates damage and healing, and expires it', () => {
  const events = [
    { t: 4, kind: 'damage', actor: 'e', target: 'c', amount: 12, routine: 'strike' },
    { t: 4, kind: 'heal', actor: 'c', target: 'c', amount: 5, routine: 'patch' },
  ] as CombatState['events'];
  let feedback = addFeedback([], events, 4);
  feedback = addFeedback(feedback, events, 5);
  expect(feedback).toHaveLength(2);
  const ctx = { save: vi.fn(), restore: vi.fn(), strokeText: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D;
  drawFeedback(ctx, feedback, 'c', 55, 45, 5);
  expect(ctx.fillText).toHaveBeenCalledTimes(2);
  expect(ctx.fillText).toHaveBeenNthCalledWith(1, '−12', 55, 55);
  expect(ctx.fillText).toHaveBeenNthCalledWith(2, '+5', 55, 83);
  expect(ctx.strokeText).toHaveBeenCalledTimes(2);
  expect(addFeedback(feedback, events, 14)).toEqual([]);
});
