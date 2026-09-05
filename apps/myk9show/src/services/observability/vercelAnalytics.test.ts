import { describe, expect, it } from 'vitest';
import {
  scrubAnalyticsEvent,
  scrubAnalyticsUrl,
  shouldMountVercelAnalytics,
} from './vercelAnalytics';

describe('scrubAnalyticsUrl', () => {
  it('drops the query string', () => {
    expect(scrubAnalyticsUrl('https://myk9show.com/payments/return?session_id=cs_test_abc')).toBe(
      'https://myk9show.com/payments/return'
    );
  });

  it('drops the fragment carrying a Supabase recovery token', () => {
    expect(
      scrubAnalyticsUrl('https://myk9show.com/reset-password#access_token=eyJ.x.y&type=recovery')
    ).toBe('https://myk9show.com/reset-password');
  });

  it('keeps origin and path when there is nothing to strip', () => {
    expect(scrubAnalyticsUrl('https://myk9show.com/shows/abc-123')).toBe(
      'https://myk9show.com/shows/abc-123'
    );
  });

  it('passes an unparseable value through unchanged', () => {
    expect(scrubAnalyticsUrl('not a url')).toBe('not a url');
  });
});

describe('scrubAnalyticsEvent', () => {
  it('rewrites only the url and preserves the event type', () => {
    expect(
      scrubAnalyticsEvent({
        type: 'pageview',
        url: 'https://myk9show.com/dogs?q=rover#top',
      })
    ).toEqual({ type: 'pageview', url: 'https://myk9show.com/dogs' });
  });
});

describe('shouldMountVercelAnalytics', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '[::1]',
    '192.168.1.20',
    'myk9.local',
    'app.localhost',
  ])('is false for the non-Vercel host %s', hostname => {
    expect(shouldMountVercelAnalytics(hostname)).toBe(false);
  });

  it.each([
    'myk9show.com',
    'myk9-platform-myk9show.vercel.app',
    'myk9-platform-myk9show-abc123-richard.vercel.app',
  ])('is true for the Vercel-served host %s', hostname => {
    expect(shouldMountVercelAnalytics(hostname)).toBe(true);
  });
});
