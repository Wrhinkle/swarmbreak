import { describe, expect, it } from 'vitest';
import { lockTravelControls, mapIconPaths, mapPinAction, mapPositions } from './map';
import type { MapNode } from './types';

describe('map presentation', () => {
  it('inspects future pins without traveling and travels only to legal pins', () => {
    const future = { id: 'future' } as MapNode, next = { id: 'next' } as MapNode;
    const traveled: string[] = [], inspected: string[] = [];
    const choose = (n: MapNode) => traveled.push(n.id), inspect = (n: MapNode) => inspected.push(n.id);
    mapPinAction(future, ['next'], choose, inspect);
    mapPinAction(next, ['next'], choose, inspect);
    expect(inspected).toEqual(['future']);
    expect(traveled).toEqual(['next']);
  });
  it('locks navigation, settings, routes and pins while a saved trip completes', () => {
    const buttons = Array.from({ length: 5 }, () => ({ disabled: false }));
    const root = { querySelectorAll: (selector: string) => { expect(selector).toBe('button'); return buttons; } };
    lockTravelControls(root as unknown as HTMLElement);
    expect(buttons.every(button => button.disabled)).toBe(true);
  });
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
