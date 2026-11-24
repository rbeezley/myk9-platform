import type { DirtyRowComparePolicy } from '@myk9/replication';

/**
 * MYK9-2361: one calendar day has two spellings on a show row. Moving a trial's day queues the
 * new days on the show for an offline device (syncReplicatedShowDates) as a calendar day
 * (`2026-12-05`), and the server's copy reads back as a timestamptz
 * (`2026-12-05T00:00:00+00:00`). Compared as text, those were a same-field collision against the
 * secretary's own change, and Edit Show's save reported "changed somewhere else".
 *
 * Both sides are compared as the calendar day (the first 10 characters of an ISO date). The same
 * day is no collision; a genuinely different day collides exactly as before, and the device's own
 * date edit (the show wizard's edit mode) is still kept. Compare only: stored values are untouched.
 * Both spellings of each field the local row carries are listed.
 */
export const SHOW_DAY_FIELDS: ReadonlySet<string> = new Set([
  'start_date',
  'end_date',
  'startDate',
  'endDate',
]);

const ISO_DAY_START = /^\d{4}-\d{2}-\d{2}(?:$|T)/;

export function normalizeShowDay(field: string, value: unknown): unknown {
  if (!SHOW_DAY_FIELDS.has(field) || typeof value !== 'string' || !ISO_DAY_START.test(value)) {
    return value;
  }
  return value.slice(0, 10);
}

export const SHOW_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  normalizeValue: normalizeShowDay,
};
