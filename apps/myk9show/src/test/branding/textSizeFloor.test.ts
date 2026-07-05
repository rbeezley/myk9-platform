import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(__dirname, '..', '..', '..');

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

describe('myK9Show text-size floor', () => {
  it('keeps Tailwind text-xs at the 14px app minimum', () => {
    const tailwind = read('tailwind.config.js');

    expect(tailwind).toContain("xs: ['0.875rem', { lineHeight: '1.25rem' }]");
    expect(tailwind).toContain("myK9Show's working UI has a 14px floor");
  });
});
