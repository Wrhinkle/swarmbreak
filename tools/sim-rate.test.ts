import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Run } from '../src/types';
import { measure, NO_BUILD, TYPICAL } from './sim';
import { withScale } from './balance';

it('does not materially reduce typical clear rate through routine edits', () => {
  // Historical textile build from ebcad7e, the reproduction for issue 14.
  const run = withScale(JSON.parse(readFileSync(new URL('./fixtures/issue-14-run.json', import.meta.url), 'utf8')) as Run, 0.69);
  const without = measure(run, NO_BUILD, 100, 12345).winRate;
  const withEdits = measure(run, TYPICAL, 100, 12345).winRate;
  expect(withEdits).toBeGreaterThanOrEqual(without - 0.1);
}, 120_000);
