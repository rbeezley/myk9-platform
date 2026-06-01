import { describe, expect, it } from 'vitest';
import { getLegacyShowDayRedirectTarget } from './LegacyExhibitorRedirects.helpers';

describe('getLegacyShowDayRedirectTarget', () => {
  it('routes legacy show-day links with a showId query to the at-show class picker', () => {
    expect(getLegacyShowDayRedirectTarget('?showId=show-1', '')).toBe('/at-show/show-1');
  });

  it('uses the selected show when the legacy link has no showId query', () => {
    expect(getLegacyShowDayRedirectTarget('', 'show-2')).toBe('/at-show/show-2');
  });

  it('falls back to exhibitor entries when no show context is available', () => {
    expect(getLegacyShowDayRedirectTarget('', '')).toBe('/exhibitor/entries');
  });
});
