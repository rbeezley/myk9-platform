import { formatShowDate } from './calendarDate';

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
  /** True when the entry window has not opened yet. */
  entryWindowNotOpen?: boolean | undefined;
  /** Raw `entry_open_date` value, when known. */
  entryOpenDate?: string | null | undefined;
  timezone: string;
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

export function pendingEntryCopy({
  hasEntryClassInventory,
  entryWindowNotOpen,
  entryOpenDate,
  timezone,
}: PendingEntryCopyInput): PendingEntryCopy {
  if (entryWindowNotOpen) {
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
    return NOT_OPEN_NO_DATE;
  }
  if (hasEntryClassInventory === false) return NO_CLASSES_COPY;
  return NOT_OPEN_NO_DATE;
}
