import { expect, it } from 'vitest';
import { comparisonRange } from './compare-atb-range';

it('splits paired comparisons into distinct reproducible seed ranges', () => {
  expect(comparisonRange()).toEqual({ count: 800, start: 1 });
  expect(comparisonRange('200', '801')).toEqual({ count: 200, start: 801 });
  for (const [count, start] of [['0', '1'], ['1', '0'], ['2', '4294967295'], ['1.5', '1'], ['1', 'NaN']]) {
    expect(() => comparisonRange(count, start)).toThrow();
  }
});
