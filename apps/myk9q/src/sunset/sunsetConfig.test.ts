import { describe, expect, it } from 'vitest';
import {
  buildMyK9ShowRedirectUrl,
  getMyK9ShowRingsideUrl,
  isMyK9QSunsetEnabled,
} from './sunsetConfig';

describe('sunsetConfig', () => {
  it('keeps the sunset mode disabled unless explicitly enabled', () => {
    expect(isMyK9QSunsetEnabled({})).toBe(false);
    expect(isMyK9QSunsetEnabled({ VITE_MYK9Q_SUNSET_ENABLED: 'false' })).toBe(false);
    expect(isMyK9QSunsetEnabled({ VITE_MYK9Q_SUNSET_ENABLED: 'true' })).toBe(true);
  });

  it('uses the staging myK9Show at-show URL by default', () => {
    expect(getMyK9ShowRingsideUrl({})).toBe('https://myk9-platform-myk9show.vercel.app/at-show');
  });

  it('uses a configured myK9Show ringside URL when present', () => {
    expect(
      getMyK9ShowRingsideUrl({
        VITE_MYK9SHOW_RINGSIDE_URL: ' https://myk9show.com/at-show ',
      })
    ).toBe('https://myk9show.com/at-show');
  });

  it('falls back to the staging myK9Show at-show URL when configured URL is invalid', () => {
    expect(
      getMyK9ShowRingsideUrl({
        VITE_MYK9SHOW_RINGSIDE_URL: '/at-show',
      })
    ).toBe('https://myk9-platform-myk9show.vercel.app/at-show');
  });

  it('builds the myK9Show redirect URL with no query params', () => {
    expect(buildMyK9ShowRedirectUrl('', {})).toBe(
      'https://myk9-platform-myk9show.vercel.app/at-show'
    );
  });

  it('preserves legacy query params when building the myK9Show redirect URL', () => {
    expect(buildMyK9ShowRedirectUrl('?code=ABC12&ring=1', {})).toBe(
      'https://myk9-platform-myk9show.vercel.app/at-show?code=ABC12&ring=1'
    );
  });

  it('does not overwrite query params configured on the target URL', () => {
    expect(
      buildMyK9ShowRedirectUrl('?code=OLD&ring=2', {
        VITE_MYK9SHOW_RINGSIDE_URL: 'https://myk9show.com/at-show?code=NEW',
      })
    ).toBe('https://myk9show.com/at-show?code=NEW&ring=2');
  });
});
