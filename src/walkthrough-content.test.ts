import { describe, expect, it } from 'vitest';
import { fightExplanation } from './walkthrough';

describe('fight walkthrough', () => {
  it('explains timing, automatic targeting and how manual orders work', () => {
    expect(fightExplanation).toMatch(/speed/i);
    expect(fightExplanation).toMatch(/lowest.*HP/i);
    expect(fightExplanation).toMatch(/next turn/i);
    expect(fightExplanation).toMatch(/cooldown/i);
  });
});
