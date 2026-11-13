import { expect, it } from 'vitest';
import { desktopRows } from './desktop-battlefield';

it('reserves distinct rows and keeps boss and ordinary fighters on their side', () => {
  const rows = desktopRows([{ creature: {} }, { creature: { puppet: true } }, { creature: {} }], 'enemy');
  expect(rows.map(r => r.size)).toEqual([164, 370, 164]);
  expect(rows.every(r => r.x > 450 && r.x + r.size <= 900)).toBe(true);
  expect(rows[1].y).toBeGreaterThan(rows[0].bottom);
  expect(rows[2].y).toBeGreaterThan(rows[1].bottom);
  expect(desktopRows([{ creature: {} }], 'crew')[0].x).toBe(70);
});
