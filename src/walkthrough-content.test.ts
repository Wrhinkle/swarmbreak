import { describe, expect, it } from 'vitest';
import { fightExplanation } from './walkthrough';

describe('fight walkthrough', () => {
  it('explains timing, automatic targeting and how manual orders work', () => {
    expect(fightExplanation).toMatch(/speed/i);
    expect(fightExplanation).toMatch(/lowest.*HP/i);
    expect(fightExplanation).toMatch(/queued routine ignores its condition/i);
    expect(fightExplanation).toMatch(/stun skips.*next action.*leaves the order queued/i);
    expect(fightExplanation).toMatch(/already charging.*complete Charge.*consuming the order.*shared cooldown/i);
    expect(fightExplanation).toMatch(/order can be lost.*fighter dies.*fight ends/i);
  });
});
