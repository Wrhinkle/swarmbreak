import { expect, it, vi } from 'vitest';
import { drawDesktopIntent } from './desktop-intent';

it('draws and wraps the current intent beneath the gauges, omitting defeated fighters', () => {
  const ctx = { fillText: vi.fn(), measureText: (s: string) => ({ width: s.length * 10 }), fillStyle: '', font: '' } as unknown as CanvasRenderingContext2D;
  drawDesktopIntent(ctx, '⚔ Strike', 70, 200, 164);
  expect(ctx.fillText).toHaveBeenCalledWith('Now: ⚔ Strike', 74, 298, 156);
  ctx.fillText = vi.fn();
  drawDesktopIntent(ctx, '💫 Stunned (turn skipped)', 70, 200, 164);
  expect(ctx.fillText).toHaveBeenCalledWith('Now: 💫 Stunned', 74, 298, 156);
  expect(ctx.fillText).toHaveBeenCalledWith('(turn skipped)', 74, 314, 156);
  drawDesktopIntent(ctx, '', 70, 200, 164);
  expect(ctx.fillText).toHaveBeenCalledTimes(2);
});
