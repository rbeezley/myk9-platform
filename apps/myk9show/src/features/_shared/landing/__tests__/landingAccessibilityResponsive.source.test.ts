import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(__dirname, '..', '..', '..', '..');

function source(relativePath: string): string {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

describe('public landing accessibility and responsive contracts', () => {
  it('provides scoped visible focus rules for every styled landing', () => {
    const styles = [
      ['banner/banner.css', 'banner'],
      ['poster/poster.css', 'poster'],
      ['fieldGuide/fieldGuide.css', 'field-guide'],
      ['gazette/gazette.css', 'gazette'],
      ['magazine/magazine.css', 'magazine'],
      ['headline/headline.css', 'headline'],
    ] as const;

    for (const [file, scope] of styles) {
      const css = source(`features/${file}`);
      expect(css).toContain(`[data-${scope}] a:focus-visible`);
      expect(css).toContain('outline: 2px solid');
      expect(css).toContain('outline-offset:');
    }
  });

  it('reduces headline navigation padding at phone width', () => {
    const css = source('features/headline/headline.css');

    expect(css).toMatch(/@media[^{}]*max-width:\s*480px/);
    expect(css).toMatch(/\.hd-nav-inner\s*{[^}]*padding:\s*12px 16px/s);
  });

  it('keeps all four affected tables in keyboard-reachable overflow regions', () => {
    const sources = [
      source('features/headline/landing/HeadlineLandingPage.tsx'),
      source('features/banner/landing/sections/ParticularsSection.tsx'),
      source('features/poster/landing/sections/ParticularsSection.tsx'),
    ].join('\n');

    expect(sources.match(/className="landing-table-scroll"/g)).toHaveLength(4);
    expect(sources.match(/tabIndex=\{0\}/g)).toHaveLength(4);
    expect(sources.match(/role="region"/g)).toHaveLength(4);
  });
});
