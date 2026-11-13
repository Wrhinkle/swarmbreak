import { describe, it, expect } from 'vitest';
import { walkthrough, inspectFight, checkScreens } from './screen-flow.mjs';

const common = ['The daily run', 'Choose your route', 'Your crew', 'In a fight'];
function driver(titles, controls) {
  let index = 0;
  const calls = [], shots = [];
  return { calls, shots, heading: async () => titles[index],
    press: async pattern => { calls.push(pattern); if (pattern === '^Next$' || pattern === '^Finish$') index++; },
    wait: async () => {}, waitButton: async pattern => calls.push(`wait ${pattern}`), controls: async () => controls,
    shot: async name => shots.push(name) };
}
describe('host walkthrough and fight', () => {
  for (const [title, mode, controls] of [
    ['Give an order', 'orders', { canvas: true, crew: true, routine: true, queue: true }],
    ['Choose an action', 'atb', { canvas: true, autoBattle: true, decision: true, manual: true }],
  ]) it(`navigates and captures the ${mode} fight`, async () => {
    const d = driver([...common, title, 'Bring an ally home'], controls);
    await walkthrough(d);
    await inspectFight(d);
    expect(d.shots).toEqual(['fresh-fight']);
    expect(d.calls).toContain('^Finish$');
    if (mode === 'atb') expect(d.calls).toEqual(expect.arrayContaining(['wait ^Auto$', '^Auto$']));
  });
  it('rejects unknown or incomplete tutorials and fights', async () => {
    await expect(walkthrough(driver([...common, 'Unknown'], {}))).rejects.toThrow('unknown walkthrough fight step');
    await expect(walkthrough(driver([...common, 'Choose an action', 'Missing'], {}))).rejects.toThrow('expected walkthrough step');
    await expect(inspectFight(driver([], { canvas: true, autoBattle: true }))).rejects.toThrow('first atb fight controls missing');
    await expect(inspectFight(driver([], { canvas: true }))).rejects.toThrow('unknown or ambiguous fight interface');
    await expect(inspectFight(driver([], { autoBattle: true, crew: true }))).rejects.toThrow('unknown or ambiguous fight interface');
  });
  for (const [mode, controls] of [
    ['orders', { canvas: true, crew: true, routine: true, queue: true }],
    ['atb', { canvas: true, autoBattle: true, decision: true, manual: true }],
  ]) for (const key of Object.keys(controls)) it(`rejects ${mode} without ${key}`, async () => {
    await expect(inspectFight(driver([], { ...controls, [key]: false }))).rejects.toThrow(/controls missing|unknown or ambiguous/);
  });
  it('accepts the retained order tutorial title with the ATB interface', async () => {
    const d = driver([...common, 'Give an order', 'Bring an ally home'], { canvas: true, autoBattle: true, decision: true, manual: true });
    await walkthrough(d);
    await inspectFight(d);
    expect(d.shots).toEqual(['fresh-fight']);
  });
});

it('requires every expected host screen at both sizes', () => {
  const screens = ['map', 'fresh-fight', 'fight', 'shop', 'treasure', 'event', 'rest', 'crew', 'title'];
  const shots = [390, 1280].flatMap(width => screens.map(screen => ({ screen, width })));
  expect(() => checkScreens(shots)).not.toThrow();
  expect(() => checkScreens(shots.filter(s => !(s.width === 1280 && s.screen === 'crew')))).toThrow('missing crew screen at 1280px');
});
