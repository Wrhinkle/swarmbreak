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
  it('rejects crawl delays beyond the timer limit, including non-finite values', () => {
    const robots = (delay: string) => `User-agent: SwarmbreakBot\nCrawl-delay: ${delay}`;
    expect(parseRobots(robots('2147483.647')).delay).toBe(2_147_483_647);
    expect(() => parseRobots(robots('2147483.648'))).toThrow('timer range');
    expect(() => parseRobots(robots('9'.repeat(400)))).toThrow('timer range');
  });
  it('refuses a page over the byte limit', async () => {
    await expect(readLimited(new Response('x'.repeat(100)), 10)).rejects.toThrow('larger');
    expect(await readLimited(new Response('ok'), 10)).toBe('ok');
  });
});
