import { expect, it } from 'vitest';
import { desktopHit, desktopRows } from './desktop-battlefield';

it('fits three fighters in two rows per side and selects the fighter under the pointer', () => {
  const fighters = [{ creature: {} }, { creature: { puppet: true } }, { creature: {} }];
  for (const side of ['crew', 'enemy'] as const) {
    const rows = desktopRows(fighters, side);
    expect(rows[0].y).toBe(rows[1].y);
    expect(rows[1].x).toBeGreaterThanOrEqual(rows[0].x + rows[0].size);
    expect(rows[2].y).toBeGreaterThan(rows[0].bottom);
    expect(rows[2].bottom).toBeLessThan(550);
    expect(rows.every(r => side === 'crew' ? r.x + r.size <= 450 : r.x >= 450 && r.x + r.size <= 900)).toBe(true);
    rows.forEach((r, i) => expect(desktopHit(rows, r.x + 1, r.y + 1)).toBe(i));
    expect(desktopHit(rows, 450, 0)).toBe(-1);
  }
});
