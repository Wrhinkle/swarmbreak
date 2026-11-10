import { describe, expect, it } from 'vitest';
import { newSave, parseSave } from './save';
import { markWalkthroughSeen } from './walkthrough';

describe('first visit walkthrough', () => {
  it('records opening the walkthrough in a save that survives a reload', () => {
    const save = newSave();
    expect(save.walkthroughSeen).toBe(false);
    markWalkthroughSeen(save);
    expect(parseSave(JSON.stringify(save)).walkthroughSeen).toBe(true);
  });
});
