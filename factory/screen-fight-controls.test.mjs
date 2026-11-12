import { afterEach, describe, expect, it, vi } from 'vitest';
import { fightControls } from './screen-fight-controls.mjs';

const button = (textContent, { visible = true, disabled = false } = {}) => ({
  textContent, checkVisibility: () => visible, matches: () => disabled,
});
function page({ choices = [], pending = true, auto = true, legacy = false } = {}) {
  const buttons = [...(auto ? [button('Auto battle: off')] : []), ...choices,
    ...(legacy ? [button('Queue order')] : [])];
  vi.stubGlobal('document', {
    querySelector: selector => selector.startsWith('canvas') ? {} : { querySelectorAll: () => choices },
    querySelectorAll: selector => selector === 'button' ? buttons : legacy ? [
      { textContent: 'Order a crew member' }, { textContent: 'Manual routine' },
    ] : [],
  });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ today: { combat: {
    atb: { pending: pending ? 'crew-1' : null }, fighters: [{ id: 'crew-1' }],
  } } }) });
  return fightControls('save');
}
afterEach(() => vi.unstubAllGlobals());
describe('host fight control inspection', () => {
  it('rejects an empty or unusable decision even when a fighter is pending', () => {
    expect(page().choices).toBe(false);
    expect(page({ choices: [button('Auto'), button('Strike', { disabled: true })] }).choices).toBe(false);
    expect(page({ choices: [button('Auto'), button('Strike', { visible: false })] }).choices).toBe(false);
  });
  it('recognizes usable choices only for an actual pending fighter', () => {
    const choices = [button('Auto'), button('Strike')];
    expect(page({ choices }).choices).toBe(true);
    expect(page({ choices, pending: false }).choices).toBe(false);
  });
  it('retains the legacy queued-order controls', () => {
    const fight = page({ auto: false, legacy: true });
    expect(fight.canvas && fight.crew && fight.routine && fight.queue).toBe(true);
    expect(fight.auto).toBe('');
  });
});
