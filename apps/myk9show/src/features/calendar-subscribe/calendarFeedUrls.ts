/**
 * calendarFeedUrls — the two URLs an exhibitor needs for one show's runs.
 *
 * Pure so the awkward parts are tested rather than eyeballed: `webcal://` is
 * not a fetchable scheme, it is a handoff that makes the OS open a calendar
 * app and SUBSCRIBE. Getting it wrong produces a link that silently does
 * nothing on iOS, which is exactly the population this feature exists for.
 */

export interface CalendarFeedUrls {
  /** Click target that makes the OS subscribe (auto-updating). */
  subscribeUrl: string;
  /** Same document over https — used for the one-off download. */
  downloadUrl: string;
  /** Plain https URL to show and copy; webcal:// looks broken pasted in a UI. */
  displayUrl: string;
}

/**
 * Base URL of the deployed calendar-feed function, e.g.
 * https://<ref>.supabase.co/functions/v1/calendar-feed
 */
export function getCalendarFeedBaseUrl(): string {
  const explicit = (import.meta.env.VITE_CALENDAR_FEED_URL as string | undefined)?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed`;
}

export function buildCalendarFeedUrls(token: string, baseUrl: string): CalendarFeedUrls | null {
  const trimmedToken = token.trim();
  const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmedToken || !trimmedBase) return null;

  const https = `${trimmedBase}?token=${encodeURIComponent(trimmedToken)}`;
  return {
    // webcal:// is http(s):// with the scheme swapped — the path and query are
    // untouched. Calendar clients then fetch it over https themselves.
    subscribeUrl: https.replace(/^https?:\/\//i, 'webcal://'),
    // `download=1` flips the function's Content-Disposition to attachment.
    downloadUrl: `${https}&download=1`,
    displayUrl: https,
  };
}

/** Filename an exhibitor will recognise months later in their downloads folder. */
export function buildIcsFilename(showName: string | null | undefined): string {
  const slug = (showName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug ? `${slug}-runs.ics` : 'myk9show-runs.ics';
}
