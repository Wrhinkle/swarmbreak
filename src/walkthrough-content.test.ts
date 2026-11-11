import { describe, expect, it } from 'vitest';
import { fightExplanation, orderExplanation } from './walkthrough';

describe('fight walkthrough', () => {
  it('explains timing, automatic targeting and how manual orders work', () => {
    expect(fightExplanation).toMatch(/speed/i);
    expect(fightExplanation).toMatch(/lowest.*HP/i);
    expect(orderExplanation).toMatch(/queued routine ignores its condition/i);
    expect(orderExplanation).toMatch(/stun skips.*next action.*leaves the order queued/i);
    expect(orderExplanation).toMatch(/already charging.*complete Charge.*consuming the order.*shared cooldown/i);
    expect(orderExplanation).toMatch(/order can be lost.*fighter dies.*fight ends/i);
  });
  it('tells a new player how to give a manual order', () => {
    expect(orderExplanation).toMatch(/choose a crew member and a routine.*Queue order/i);
  });
});
