import type { ReplicatedDog, ReplicatedEntry, ReplicatedShow } from '@/services/replication';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';

/** Entry states the server RPC `get_account_today_entries` also leaves out. */
const INACTIVE_ENTRY_STATUSES = new Set(['withdrawn', 'scratched']);

/**
 * Does the device already hold an entry of this person's for this show, while
 * the show is on today? Mirrors the server RPC `get_account_today_entries`
 * (20260908134500, show-timezone rule from 20261024163700): the show is live (`startDate <= today <= endDate`,
 * inclusive, not soft-deleted) and the entry is neither withdrawn, scratched
 * nor soft-deleted. Ownership uses the same rule as the replica fallback of
 * `getUserEntries`: the person handles it, or owns its dog.
 *
 * Pure (rows in, boolean out) so it needs no IndexedDB. "Today" is the
 * show-local calendar date of `now` in the show's primary-trial timezone
 * (`getEntryWindowTimezone`: earliest trial by date then id, default
 * America/New_York), the same rule the RPC applies since
 * 20261024163700_myk9_1354_account_today_entries_show_timezone.sql. The old
 * UTC date admitted exhibitors the evening before day 1 and refused them the
 * evening of the last day.
 */
export function hasLocalEntryForShowToday(input: {
  personId: string | null | undefined;
  showId: string | undefined;
  now: Date;
  /** The show's live (non-deleted) trials; they supply the show timezone. */
  trials: readonly EntryWindowTrial[];
  show: Pick<ReplicatedShow, 'id' | 'startDate' | 'endDate' | 'deletedAt'> | null | undefined;
  entries: readonly ReplicatedEntry[];
  dogs: readonly Pick<ReplicatedDog, 'id' | 'ownerId'>[];
}): boolean {
  const { personId, showId, now, trials, show, entries, dogs } = input;
  if (!personId || !showId || !show) return false;
  if (show.id !== showId || show.deletedAt) return false;
  if (!show.startDate || !show.endDate) return false;
  const today = calendarDateInTimeZone(now, getEntryWindowTimezone(trials));
  if (today < show.startDate || today > show.endDate) return false;

  const ownedDogIds = selectOwnedDogIds(dogs, personId);
  return entries.some(entry => {
    if (entry.showId !== showId) return false;
    if (entry.deletedAt ?? entry.deleted_at) return false;
    if (INACTIVE_ENTRY_STATUSES.has(entry.entryStatus ?? '')) return false;
    return entry.handlerId === personId || (entry.dogId ? ownedDogIds.has(entry.dogId) : false);
  });
}
