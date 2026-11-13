import { expect, it, vi } from 'vitest';
import { bindDesktopInspection, desktopHit, desktopRows } from './desktop-battlefield';

it('fits a large boss and other fighters without overlap on either side', () => {
  for (const fighters of [
    [{ creature: { puppet: true } }, { creature: {} }, { creature: {} }],
    [{ creature: {} }, { creature: { puppet: true } }, { creature: {} }],
  ]) for (const side of ['crew', 'enemy'] as const) {
    const rows = desktopRows(fighters, side);
    expect(rows[fighters.findIndex(f => f.creature.puppet)].size).toBe(370);
    rows.forEach((r, i) => {
      expect(side === 'crew' ? r.x + r.size <= 450 : r.x >= 450 && r.x + r.size <= 900).toBe(true);
      expect(desktopHit(rows, r.x + 1, r.bottom - 1)).toBe(i);
      rows.slice(i + 1).forEach(s => expect(r.x + r.size <= s.x || s.x + s.size <= r.x || r.bottom <= s.y || s.bottom <= r.y).toBe(true));
    });
    expect(desktopHit(rows, 450, 0)).toBe(-1);
  }
});

it('selects every enemy using scaled pointer coordinates and keyboard navigation', () => {
  const handlers: Record<string, (event: any) => void> = {};
  const canvas = { width: 900, height: 800, getBoundingClientRect: () => ({ left: 20, top: 30, width: 450, height: 400 }), addEventListener: (type: string, fn: (event: any) => void) => { handlers[type] = fn; } } as unknown as HTMLCanvasElement;
  const fighters = [{ id: 'a', creature: {} }, { id: 'b', creature: { puppet: true } }, { id: 'c', creature: {} }];
  const inspect = vi.fn();
  bindDesktopInspection(canvas, () => fighters, inspect);
  desktopRows(fighters, 'enemy').forEach((r, i) => {
    handlers.click({ clientX: 20 + (r.x + 1) / 2, clientY: 30 + (r.y + 1) / 2 });
    expect(inspect).toHaveBeenLastCalledWith(fighters[i].id);
  });
  const preventDefault = vi.fn();
  for (const id of ['a', 'b', 'c']) { handlers.keydown({ key: 'ArrowRight', preventDefault }); expect(inspect).toHaveBeenLastCalledWith(id); }
  handlers.keydown({ key: 'ArrowLeft', preventDefault });
  expect(inspect).toHaveBeenLastCalledWith('b');
  expect(preventDefault).toHaveBeenCalledTimes(4);
});
