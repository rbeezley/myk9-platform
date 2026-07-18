import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const responsiveStyles = readFileSync(join(__dirname, 'manager-responsive.css'), 'utf8');

describe('manager responsive styles', () => {
  it('keeps manager header actions at a usable touch target', () => {
    expect(responsiveStyles).toContain('.manager-page-actions button');
    expect(responsiveStyles).toContain('.manager-page-actions a');
    expect(responsiveStyles).toContain('min-height: 44px');
  });
});
