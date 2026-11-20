import type { EntryPendingReason } from '@/utils/entryStatusUtils';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { CARD_ENTRIES_PAUSED_MESSAGE } from '@/features/payments/cardEntriesPaused';
import { formatShowDate, getCalendarDayParts } from './calendarDate';

/**
 * Why a published show's online entry is not available, in the words each
 * landing style needs. Callers only reach this when entries are NOT closed.
 *
 * Reasons, in order of how sure we are:
 * - the entry window has not opened: say so, with the date when it is known;
 * - the show is confirmed to have no classes (`hasEntryClassInventory === false`):
 *   only then say classes are missing;
 * - anything else: a neutral "not open yet", never an invented reason.
 */
export interface PendingEntryCopy {
  kind: 'not-open' | 'no-classes';
  /** Short nav / strip label. */
  nav: string;
  /** One full sentence for hero blocks. */
  sentence: string;
  /** Headline split so styles can accent the second part. No trailing period. */
  headlineLead: string;
  headlineAccent: string;
  /** Supporting line under a headline. */
  sub: string;
}

export interface PendingEntryCopyInput {
  /** `false` only when the show is confirmed to have no classes; `null` is unknown. */
  hasEntryClassInventory?: boolean | null | undefined;
  /** Why entries are pending, from `getEntryStatus`; undefined when not pending. */
  entryPendingReason?: EntryPendingReason | undefined;
  /** Raw `entry_open_date` value, when known. */
  entryOpenDate?: string | null | undefined;
  timezone: string;
  /** Injected for tests. */
  now?: Date;
}

export const NO_CLASSES_COPY: PendingEntryCopy = {
  kind: 'no-classes',
  nav: 'Classes pending',
  sentence: 'Entries are not available yet because no classes are assigned yet.',
  headlineLead: 'Entries open when',
  headlineAccent: 'classes are assigned',
  sub: 'The secretary still needs to assign classes before online entry is available.',
};

export const NOT_OPEN_NO_DATE: PendingEntryCopy = {
  kind: 'not-open',
  nav: 'Not open yet',
  sentence: 'Entries are not open yet.',
  headlineLead: 'Entries are',
  headlineAccent: 'not open yet',
  sub: 'Online entry is not available yet.',
};

/** MYK9-2192: the club's payouts are off and the show takes no check or cash. Neutral on purpose. */
export const CARD_PAUSED_COPY: PendingEntryCopy = {
  kind: 'not-open',
  nav: 'Entries paused',
  sentence: CARD_ENTRIES_PAUSED_MESSAGE,
  headlineLead: 'Card entries are',
  headlineAccent: 'paused',
  sub: 'Contact the secretary.',
};

/** True when the open date (a calendar day or an instant) is still ahead of `now`. */
function isFutureOpenDate(iso: string, timezone: string, now: Date): boolean {
  const day = getCalendarDayParts(iso);
  if (day) {
    const today = calendarDateInTimeZone(now, timezone);
    const open = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    return open > today;
  }
  const instant = new Date(iso).getTime();
  return !Number.isNaN(instant) && instant > now.getTime();
}

export function pendingEntryCopy({
  hasEntryClassInventory,
  entryPendingReason,
  entryOpenDate,
  timezone,
  now = new Date(),
}: PendingEntryCopyInput): PendingEntryCopy {
  if (entryPendingReason === 'card_paused') return CARD_PAUSED_COPY;
  if (entryPendingReason) {
    // Only `not_yet_open` with a date still ahead can say "opens <date>". The
    // other reasons (no window, unknown online setting) say nothing about when,
    // and a stale or past date would read as a lie.
    if (
      entryPendingReason === 'not_yet_open' &&
      entryOpenDate &&
      isFutureOpenDate(entryOpenDate, timezone, now)
    ) {
      const short = formatShowDate(entryOpenDate, timezone, { month: 'short', day: 'numeric' });
      const long = formatShowDate(entryOpenDate, timezone, { month: 'long', day: 'numeric' });
      if (short && long) {
        return {
          kind: 'not-open',
          nav: `Opens ${short}`,
          sentence: `Entries open ${long}.`,
          headlineLead: 'Entries open',
          headlineAccent: short,
          sub: 'Online entry is not available until then.',
        };
      }
    }
    return NOT_OPEN_NO_DATE;
  }
  if (hasEntryClassInventory === false) return NO_CLASSES_COPY;
  return NOT_OPEN_NO_DATE;
}
