import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('provides feedback for interactive cards, map pins and disclosures, including reduced motion', () => {
  const css = readFileSync('index.html', 'utf8');
  for (const selector of ['.card:has(button:not(:disabled)):hover', '.card:has(button:not(:disabled)):active', '.pin:hover:not(:disabled) b', '.pin:active:not(:disabled) b', '.hud-menu summary:hover', '.routine-picker summary:active']) {
    expect(css).toContain(selector);
  }
  expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.card[^}]*transition:none/);
});
