import { describe, expect, it } from 'vitest';

import { MYK9Q_ORIGINS, MYK9SHOW_ORIGINS, resolveCorsOrigin } from '../cors';

const MYK9SHOW_PREVIEW_ORIGIN =
  'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app';

describe('shared CORS origin contract', () => {
  it.each([
    'https://myk9show.com',
    'https://www.myk9show.com',
    'https://app.myk9show.com',
    'https://myk9-platform-myk9show.vercel.app',
    MYK9SHOW_PREVIEW_ORIGIN,
    'http://localhost:5173',
    'http://localhost:5174',
  ])('reflects an allowed myK9Show origin: %s', origin => {
    expect(resolveCorsOrigin(origin, MYK9SHOW_ORIGINS)).toBe(origin);
  });

  it.each([
    'https://myk9-platform-myk9show.vercel.app.attacker.example',
    'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app.attacker.example',
    'https://myk9-platform-myk9show.attacker.vercel.app',
    'http://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app',
    'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app:443',
    'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app/',
  ])('does not reflect a lookalike origin: %s', origin => {
    expect(resolveCorsOrigin(origin, MYK9SHOW_ORIGINS)).toBe(MYK9SHOW_ORIGINS[0]);
  });

  it('only enables dynamic previews when the canonical preview origin is present', () => {
    const originsWithoutPreview = MYK9SHOW_ORIGINS.filter(
      origin => origin !== 'https://myk9-platform-myk9show.vercel.app'
    );

    expect(resolveCorsOrigin(MYK9SHOW_PREVIEW_ORIGIN, originsWithoutPreview)).toBe(
      originsWithoutPreview[0]
    );
  });

  it('keeps the myK9Q origin contract separate from myK9Show previews', () => {
    expect(resolveCorsOrigin(MYK9SHOW_PREVIEW_ORIGIN, MYK9Q_ORIGINS)).toBe(MYK9Q_ORIGINS[0]);
    expect(resolveCorsOrigin('https://myk9-platform-myk9q.vercel.app', MYK9Q_ORIGINS)).toBe(
      'https://myk9-platform-myk9q.vercel.app'
    );
  });
});
