import { describe, expect, it } from 'vitest';
import { countdownLineText } from './countdown';

describe('countdownLineText', () => {
  const now = Date.parse('2026-11-05T13:00:00Z');
  it('reports a late run after its opening time for either prefix', () => {
    for (const prefix of ['Next run in', 'Next run opens in']) {
      expect(countdownLineText(prefix, '2026-11-05T12:59:59Z', now)).toBe('The next run is late. Check back soon.');
    }
  });
  it('preserves the countdown format before and at the opening time', () => {
    expect(countdownLineText('Next run opens in', '2026-11-05T16:12:09Z', now)).toBe('Next run opens in 03:12:09');
    expect(countdownLineText('Next run in', '2026-11-06T15:00:00Z', now)).toBe('Next run in 1d 02:00:00');
    expect(countdownLineText('Next run in', '2026-11-05T13:00:00Z', now)).toBe('Next run in 00:00:00');
  });
  it('reports an invalid opening time', () => {
    expect(countdownLineText('Next run in', 'invalid', now)).toBe('Next run in opening time unavailable');
  });
});
