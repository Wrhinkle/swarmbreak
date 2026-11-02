import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateAct, exitReachable } from './generator';

const html = readFileSync(new URL('../snapshots/wikipedia-volcano.html', import.meta.url), 'utf8');
const source = 'https://en.wikipedia.org/wiki/Volcano';
describe('generateAct', () => {
  it('turns the Volcano snapshot into a deterministic, connected map', () => {
    const act = generateAct(html, source);
    expect(act.title).toBe('Volcano');
    expect(act.rooms.length).toBeGreaterThan(10);
    expect(act.rooms.some(r => r.name === 'Plate tectonics')).toBe(true);
    expect(act.rooms.some(r => r.name === 'References')).toBe(false);
    expect(exitReachable(act)).toBe(true);
    for (const [i, a] of act.rooms.entries()) for (const b of act.rooms.slice(i + 1)) {
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
    expect(JSON.stringify(generateAct(html, source))).toBe(JSON.stringify(act));
  });
  it('connects a heading-free page and detects a disconnected exit', () => {
    const act = generateAct('<title>Quiet</title><body>Just text</body>', source);
    expect(act.rooms).toHaveLength(2);
    expect(exitReachable(act)).toBe(true);
    expect(exitReachable({ ...act, paths: act.paths.filter(p => p.from !== act.exit && p.to !== act.exit) })).toBe(false);
  });
  it('ignores executable and image content and uses only h2 and h3 as sections', () => {
    const act = generateAct('<h1>Page</h1><main><h2>Section</h2>Safe<script>bad script</script><img onerror="bad image"><h4>Not a room</h4><h3>Side</h3>More</main>', source);
    expect(act.rooms.map(r => r.name)).toEqual(['Page', 'Section', 'Side']);
    expect(act.rooms.map(r => r.text).join(' ')).not.toMatch(/bad script|bad image/);
  });
});
