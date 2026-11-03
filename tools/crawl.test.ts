import { describe, it, expect } from 'vitest';
import { allowed, parseRobots, readLimited, publicAddress, publicRequest } from './crawl';
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

describe('public crawler destinations', () => {
  it('rejects private and special IPv4 and IPv6 addresses', () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '169.254.169.254', '100.64.0.1', '192.0.2.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002::1']) expect(publicAddress(address), address).toBe(false);
    for (const address of ['8.8.8.8', '2606:4700:4700::1111']) expect(publicAddress(address), address).toBe(true);
  });
  it('rejects private literal destinations before making a connection', async () => {
    await expect(publicRequest(new URL('http://127.0.0.1/robots.txt'))).rejects.toThrow('not public');
    await expect(publicRequest(new URL('http://[::1]/redirect'))).rejects.toThrow('not public');
  });
});
