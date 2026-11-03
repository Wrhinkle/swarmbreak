import { describe, it, expect } from 'vitest';
import { allowed, parseRobots, readLimited } from './crawl';
describe('crawler limits', () => {
  it('obeys a rule aimed at this bot over a wildcard allow', () => {
    const robots = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: SwarmbreakBot\nDisallow: /private\n');
    expect(allowed('/private/x', robots.rules)).toBe(false);
    expect(allowed('/public', robots.rules)).toBe(true);
  });
  it('falls back to the wildcard group', () => {
    expect(allowed('/a', parseRobots('User-agent: *\nDisallow: /a\n').rules)).toBe(false);
  });
  it('refuses a page over the byte limit', async () => {
    await expect(readLimited(new Response('x'.repeat(100)), 10)).rejects.toThrow('larger');
    expect(await readLimited(new Response('ok'), 10)).toBe('ok');
  });
});
