import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCalendarFeedUrls,
  buildIcsFilename,
  countIcsEvents,
  getCalendarFeedBaseUrl,
} from './calendarFeedUrls';

const BASE = 'https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/calendar-feed';
const TOKEN = 'a'.repeat(64);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildCalendarFeedUrls', () => {
  it('swaps the scheme for webcal:// while keeping path and query intact', () => {
    const urls = buildCalendarFeedUrls(TOKEN, BASE);
    expect(urls?.subscribeUrl).toBe(
      `webcal://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/calendar-feed?token=${TOKEN}`
    );
  });

  it('offers the plain https URL for display and copy', () => {
    // webcal:// pasted into a UI looks broken; users copy the https one.
    expect(buildCalendarFeedUrls(TOKEN, BASE)?.displayUrl).toBe(`${BASE}?token=${TOKEN}`);
  });

  it('marks the download URL so the function sends an attachment', () => {
    expect(buildCalendarFeedUrls(TOKEN, BASE)?.downloadUrl).toBe(
      `${BASE}?token=${TOKEN}&download=1`
    );
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(buildCalendarFeedUrls(TOKEN, `${BASE}/`)?.displayUrl).toBe(`${BASE}?token=${TOKEN}`);
  });

  it('percent-encodes the token rather than trusting it verbatim', () => {
    expect(buildCalendarFeedUrls('a b&c', BASE)?.displayUrl).toBe(`${BASE}?token=a%20b%26c`);
  });

  it('returns null instead of a half-built URL when token or base is missing', () => {
    expect(buildCalendarFeedUrls('', BASE)).toBeNull();
    expect(buildCalendarFeedUrls('   ', BASE)).toBeNull();
    expect(buildCalendarFeedUrls(TOKEN, '')).toBeNull();
  });

  it('handles an http base (local dev) without leaving the scheme behind', () => {
    const urls = buildCalendarFeedUrls(TOKEN, 'http://localhost:54321/functions/v1/calendar-feed');
    expect(urls?.subscribeUrl.startsWith('webcal://localhost:54321/')).toBe(true);
    expect(urls?.subscribeUrl).not.toContain('http');
  });
});

describe('getCalendarFeedBaseUrl', () => {
  it('derives the function URL from the Supabase URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_CALENDAR_FEED_URL', '');
    expect(getCalendarFeedBaseUrl()).toBe('https://test.supabase.co/functions/v1/calendar-feed');
  });

  it('prefers an explicit override', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_CALENDAR_FEED_URL', 'https://cal.myk9show.com/feed');
    expect(getCalendarFeedBaseUrl()).toBe('https://cal.myk9show.com/feed');
  });

  it('returns empty when nothing is configured, so callers can hide the UI', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_CALENDAR_FEED_URL', '');
    expect(getCalendarFeedBaseUrl()).toBe('');
  });
});

describe('buildIcsFilename', () => {
  it('slugifies the show name', () => {
    expect(buildIcsFilename('Bexar County KC — Spring Trial')).toBe(
      'bexar-county-kc-spring-trial-runs.ics'
    );
  });

  it('falls back when the show has no usable name', () => {
    expect(buildIcsFilename(null)).toBe('myk9show-runs.ics');
    expect(buildIcsFilename('!!!')).toBe('myk9show-runs.ics');
  });

  it('bounds the length so the filename stays sane', () => {
    expect(buildIcsFilename('x'.repeat(200)).length).toBeLessThanOrEqual(70);
  });
});

describe('countIcsEvents', () => {
  const wrap = (body: string) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR', ''].filter(Boolean).join('\r\n');

  it('counts the events in a feed', () => {
    expect(
      countIcsEvents(
        wrap(
          ['BEGIN:VEVENT', 'UID:a', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:b', 'END:VEVENT'].join(
            '\r\n'
          )
        )
      )
    ).toBe(2);
  });

  it('reports zero for the empty calendar that made the exhibitor see nothing', () => {
    // The exact document MYK9-109 Load Show 1 was serving: valid, no events.
    expect(countIcsEvents(wrap(''))).toBe(0);
  });

  it('is not fooled by the text appearing inside a folded description', () => {
    // Continuation lines start with a space, so an anchored match cannot see it.
    const ics = wrap(
      [
        'BEGIN:VEVENT',
        'DESCRIPTION:careful',
        ' BEGIN:VEVENT is only words here',
        'END:VEVENT',
      ].join('\r\n')
    );
    expect(countIcsEvents(ics)).toBe(1);
  });

  it('reads a feed that uses bare LF instead of CRLF', () => {
    expect(countIcsEvents('BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR\n')).toBe(1);
  });

  it('reports zero rather than throwing on junk', () => {
    expect(countIcsEvents('')).toBe(0);
    expect(countIcsEvents('<html>not a calendar</html>')).toBe(0);
  });
});
