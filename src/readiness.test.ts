import { expect, it } from 'vitest';
import { readiness } from './readiness';

it('reports turn progress without predicting an action or target', () => {
  expect(readiness({ hp: 10, speed: 8, nextAction: 8 }, 0)).toBe('Turn readiness: 0%');
  expect(readiness({ hp: 10, speed: 8, nextAction: 8 }, 4)).toBe('Turn readiness: 50%');
  expect(readiness({ hp: 10, speed: 8, nextAction: 8 }, 8)).toBe('Turn ready');
  expect(readiness({ hp: 0, speed: 8, nextAction: 8 }, 4)).toBe('Down');
});
