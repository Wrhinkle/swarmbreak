import { describe, expect, it } from 'vitest';
import { fighterHealth, roomType } from './ui';

describe('readable game labels', () => {
  it('identifies room types without revealing hidden rooms', () => {
    expect(roomType('elite', false)).toBe('Elite');
    expect(roomType('elite', true)).toBe('Mystery');
  });
  it('reports current health and shield without canvas scaling', () => {
    expect(fighterHealth('Ally', 12.2, 30, 3.1)).toBe('Ally: 13 / 30 HP · 4 shield');
    expect(fighterHealth('Foe', 0, 20, 0)).toBe('Foe: 0 / 20 HP');
  });
});
