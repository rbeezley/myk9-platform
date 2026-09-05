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

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * `/_vercel/insights/script.js` only exists on a Vercel-served origin. Under
 * `vite dev`, `vite preview` (the E2E PR Smoke target on :4173) or a LAN IP
 * it 404s, and the secretary QA-regression spec fails the run on any failed
 * response. Mount only where the script can load.
 */
export function shouldMountVercelAnalytics(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(host)) return false;
  if (host.endsWith('.local') || host.endsWith('.localhost')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}
