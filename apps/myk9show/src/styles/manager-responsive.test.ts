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

  it('restores compact admin headers only when their content column can fit', () => {
    expect(responsiveStyles).toContain('@container (min-width: 700px)');
    expect(responsiveStyles).toContain('.manager-page-header.manager-page-header--compact');
    expect(responsiveStyles).toContain(
      '.manager-page-header.manager-page-header--compact .manager-page-actions'
    );
    expect(responsiveStyles).toMatch(
      /\.manager-page-header\.manager-page-header--compact[\s\S]*?flex-direction:\s*row/
    );
    expect(responsiveStyles).toMatch(
      /\.manager-page-header\.manager-page-header--compact \.manager-page-actions[\s\S]*?width:\s*auto/
    );
  });
});
