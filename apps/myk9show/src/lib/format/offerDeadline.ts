/**
 * How a wait list offer's deadline reads, everywhere it is shown: the
 * exhibitor's My Shows card, the secretary's offer dialog and Offered list,
 * and (rendered by the database in the same shape) the in-app offer message.
 * "Wed, Jul 15, 2:00 PM EDT": weekday, date, clock time and zone, in the
 * offered class's trial zone (New York when unknown, via getTrialTimezone).
 */

import { getTrialTimezone } from '@/features/registries';

/** The server's default offer window (promote_waitlist_entry_internal). */
export const DEFAULT_OFFER_WINDOW_HOURS = 48;

/**
 * The window an offer made now will get: shows.waitlist_payment_deadline_hours,
 * 48 when unset, never under 1 — promote_waitlist_entry_internal's
 * GREATEST(1, COALESCE(hours, 48)).
 */
export function resolveOfferWindowHours(hours: number | null | undefined): number {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return DEFAULT_OFFER_WINDOW_HOURS;
  }
  return Math.max(1, Math.floor(hours));
}

/** "Wed, Jul 15, 2:00 PM EDT", or null when the instant is missing or invalid. */
export function formatOfferDeadline(
  instant: string | Date | null | undefined,
  timezone: string | null | undefined
): string | null {
  if (!instant) return null;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getTrialTimezone({ timezone: timezone ?? undefined }),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
    .formatToParts(date)
    .map(part => (part.type === 'literal' && part.value === ' at ' ? ', ' : part.value))
    .join('');
}

/** "48 hours", "1 hour". */
export function formatOfferWindow(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
