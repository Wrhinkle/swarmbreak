import { describe, expect, it } from 'vitest';
import { mapIconPaths, mapPositions } from './map';
import type { MapNode } from './types';

describe('map presentation', () => {
  it('keeps coordinates stable and puts the final room above the start', () => {
    const nodes = [{id:'a',floor:0,x:0},{id:'b',floor:1,x:1}] as MapNode[];
    const first = mapPositions(nodes);
    expect(mapPositions(nodes)).toEqual(first);
    expect(first.get('b')!.y).toBeLessThan(first.get('a')!.y);
    expect(first.get('b')!.x).toBe(50);
  });
  it('has a distinct SVG icon for every visible room type and mystery', () => {
    for (const kind of ['fight','elite','rest','event','shop','treasure','boss','mystery']) expect(mapIconPaths[kind]).toBeTruthy();
    expect(new Set(Object.values(mapIconPaths)).size).toBeGreaterThanOrEqual(7);
  });
});
