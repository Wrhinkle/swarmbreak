import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('title brand stays small enough for its word at phone width', () => {
  const html = readFileSync('index.html', 'utf8');
  const mobile = html.match(/\.title-brand\{font-size:clamp\((\d+(?:\.\d+)?)rem,(\d+(?:\.\d+)?)vw,(\d+(?:\.\d+)?)rem\)\}/);
  expect(mobile).not.toBeNull();
  const [, min, preferred, max] = mobile!.map(Number);
  const fontSize = Math.min(Number(max) * 16, Math.max(Number(min) * 16, Number(preferred) * 390 / 100));
  // Georgia's measured title width at 46.8px, including .03em letter spacing, is 351.49px.
  expect(fontSize * (351.49 / 46.8)).toBeLessThan(390 - 40);
});
