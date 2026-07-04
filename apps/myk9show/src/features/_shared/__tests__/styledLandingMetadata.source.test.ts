import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const landingPages = [
  'banner/landing/BannerLandingPage.tsx',
  'fieldGuide/landing/FieldGuideLandingPage.tsx',
  'gazette/landing/GazetteLandingPage.tsx',
  'headline/landing/HeadlineLandingPage.tsx',
  'heritage/landing/HeritageLandingPage.tsx',
  'magazine/landing/MagazineLandingPage.tsx',
  'monogram/landing/MonogramLandingPage.tsx',
  'poster/landing/PosterLandingPage.tsx',
];

describe('styled public landing metadata', () => {
  it('keeps every public landing style responsible for its document title', () => {
    for (const relativePath of landingPages) {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

      expect(source, relativePath).toContain('<title>');
      expect(source, relativePath).toContain('data.showName');
      expect(source, relativePath).toContain('data.clubName');
    }
  });

  it('keeps every public landing style responsible for a page description', () => {
    for (const relativePath of landingPages) {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

      expect(source, relativePath).toContain('name="description"');
      expect(source, relativePath).toContain('data.showSubtitle');
    }
  });
});
