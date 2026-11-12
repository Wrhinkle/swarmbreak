import { describe, expect, it } from 'vitest';
import { fightExplanation, orderExplanation } from './walkthrough';

describe('fight walkthrough', () => {
  it('explains timing and that the fight waits for a ready crew member', () => {
    expect(fightExplanation).toMatch(/speed/i);
    expect(fightExplanation).toMatch(/ready.*waits for you/i);
  });
  it('tells a new player how to choose an action, a target, or Auto', () => {
    expect(orderExplanation).toMatch(/choose an action.*target/i);
    expect(orderExplanation).toMatch(/Auto follows.*routines.*lowest HP/i);
    expect(orderExplanation).toMatch(/Auto battle/);
  });
});
