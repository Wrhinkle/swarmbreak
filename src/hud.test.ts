import { describe, expect, it } from 'vitest';
import { hudHealth, hudLocation } from './hud';
import type { Today } from './save';
import type { CombatState } from './combat';
import type { MapNode } from './types';

describe('run HUD', () => {
  it('shows live fighter health during combat and saved health otherwise, excluding reserves and summons', () => {
    const today = { crew: [{ active: true, hp: 25 }, { active: false, hp: 30 }, { active: true, hp: 20 }] } as Today;
    const combat = { fighters: [{ side: 'crew', hp: 12 }, { side: 'crew', hp: 3, summonedBy: 'c0' }, { side: 'enemy', hp: 9 }, { side: 'crew', hp: 0 }] } as CombatState;
    expect(hudHealth(today, combat, true)).toEqual([12, 0]);
    expect(hudHealth(today, combat, false)).toEqual([25, 20]);
  });
  it('labels the current act, room and gold, including the start', () => {
    const today = { act: 1, gold: 45 } as Today;
    expect(hudLocation(today, { floor: 2 } as MapNode)).toBe('Act 2 · Room 3 · 45 gold');
    expect(hudLocation(today, undefined)).toBe('Act 2 · Start · 45 gold');
  });
});
