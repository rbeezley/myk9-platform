import type { BeforeSendEvent } from '@vercel/analytics/react';

/**
 * Reduce an analytics URL to origin + path before it leaves the browser.
 *
 * Query strings and fragments on this app carry secrets: Stripe returns to
 * `?session_id=`, Supabase recovery links land on `/reset-password` with an
 * `#access_token=` fragment, and search pages encode user input. None of that
 * belongs in a traffic dashboard. A URL that cannot be parsed is passed
 * through untouched rather than dropped, so a malformed href still counts as
 * a page view.
 */
export function scrubAnalyticsUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: scrubAnalyticsUrl(event.url) };
}
