import { describe, expect, it } from 'vitest';
import { ROUTINES } from './library';
import { routineText } from './routine-text';

describe('routine labels', () => {
  it('describes the conditions on every available routine', () => {
    for (const routine of Object.values(ROUTINES)) expect(routineText(routine)).not.toContain('undefined');
    expect(routineText(ROUTINES.jam)).toBe('Every third action: Stun');
    expect(routineText(ROUTINES.corrupt)).toBe('If a foe is not corrupted: Corrupt');
  });
});

it('labels manual actions without implying their automatic conditions apply', async () => {
  const { manualActionText } = await import('./routine-text');
  expect(manualActionText(ROUTINES.patch)).toBe('Patch · Patch');
  expect(manualActionText(ROUTINES.jam)).toBe('Jam · Stun');
});
