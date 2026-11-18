import { test } from 'vitest';
import { strict as assert } from 'node:assert';
import { screenTime } from './screen-clock.mjs';

const manifest = { runId: 'old', opensAt: '2026-11-10T13:00:00Z', nextOpensAt: '2026-11-11T13:00:00Z',
  next: { runId: 'next', opensAt: '2026-11-11T13:00:00Z' } };
test('the selected run is open during the check even after its real expiry', () => {
  const result = screenTime(manifest, Date.parse('2026-11-18T13:00:00Z'));
  assert.equal(result.live.runId, 'next');
  assert.ok(result.time >= Date.parse(result.live.opensAt));
  assert.ok(result.time < Date.parse(result.live.opensAt) + 86_400_000);
});
test('a future next run does not replace the current run', () => {
  const result = screenTime(manifest, Date.parse('2026-11-11T12:59:59Z'));
  assert.equal(result.live.runId, 'old');
  assert.ok(result.time >= Date.parse(manifest.opensAt) && result.time < Date.parse(manifest.next.opensAt));
});
test('unusable timing fails closed', () => {
  assert.throws(() => screenTime({ opensAt: 'invalid', nextOpensAt: 'invalid' }, 0), /no usable opening interval/);
});
