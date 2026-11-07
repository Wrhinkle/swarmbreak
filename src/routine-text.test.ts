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
