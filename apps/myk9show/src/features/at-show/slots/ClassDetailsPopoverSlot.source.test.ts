import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'ClassDetailsPopoverSlot.tsx'), 'utf8');

describe('ClassDetailsPopoverSlot touch targets', () => {
  it('keeps the close button at the 44px ringside touch floor', () => {
    expect(source).toContain('aria-label="Close"');
    expect(source).toContain('min-h-11 min-w-11');
    expect(source).not.toContain('h-6 w-6');
  });
});
