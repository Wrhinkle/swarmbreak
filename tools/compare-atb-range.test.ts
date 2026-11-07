import { expect, it } from 'vitest';
import { comparisonCheckpoint, comparisonPolicies, comparisonRange } from './compare-atb-range';

it('splits paired comparisons into distinct reproducible seed ranges', () => {
  expect(comparisonRange()).toEqual({ count: 800, start: 1 });
  expect(comparisonRange('200', '801')).toEqual({ count: 200, start: 801 });
  for (const [count, start] of [['0', '1'], ['1', '0'], ['2', '4294967295'], ['1.5', '1'], ['1', 'NaN']]) {
    expect(() => comparisonRange(count, start)).toThrow();
  }
});

it('reports intermediate totals and the final partial batch', () => {
  expect(Array.from({ length: 23 }, (_, i) => i + 1).filter(n => comparisonCheckpoint(n, 23))).toEqual([10, 20, 23]);
  expect(comparisonCheckpoint(10, 10)).toBe(true);
});

it('allows a comparison batch to select a single policy', () => {
  expect(comparisonPolicies()).toEqual(['typical', 'expert', 'no-build']);
  expect(comparisonPolicies('expert')).toEqual(['expert']);
  expect(() => comparisonPolicies('novice')).toThrow();
});
