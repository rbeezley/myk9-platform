import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve(__dirname, '../headline.css');

describe('headline responsive source guards', () => {
  it('prevents headline nav and CTA rows from forcing mobile overlap', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('[data-headline] .hd-nav-inner');
    expect(css).toContain('min-width: 0;');
    expect(css).toContain('[data-headline] .hd-nav-mark .mono');
    expect(css).toContain('text-overflow: ellipsis;');
    expect(css).toContain('[data-headline] .hd-nav-cta');
    expect(css).toContain('flex-shrink: 0;');
    expect(css).toContain('min-height: 44px;');
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.hd-cta[\s\S]*width: 100%;/);
  });
});
