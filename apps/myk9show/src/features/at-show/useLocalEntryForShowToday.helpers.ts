import type { ReplicatedDog, ReplicatedEntry, ReplicatedShow } from '@/services/replication';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';

/** Entry states the server RPC `get_account_today_entries` also leaves out. */
const INACTIVE_ENTRY_STATUSES = new Set(['withdrawn', 'scratched']);

/**
 * Does the device already hold an entry of this person's for this show, while
 * the show is on today? Mirrors the server RPC `get_account_today_entries`
 * (20260908134500, show-timezone rule from 20261024163700): the show is live (`startDate <= today <= endDate`,
 * inclusive, not soft-deleted) and the entry is neither withdrawn, scratched
 * nor soft-deleted. Ownership mirrors the RPC's three branches: the person
 * handles the entry, or is the owner or co-owner of its dog.
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
  dogs: readonly Pick<ReplicatedDog, 'id' | 'ownerId' | 'coOwnerId' | 'deletedAt' | 'deleted_at'>[];
}): boolean {
  const { personId, showId, now, trials, show, entries, dogs } = input;
  if (!personId || !showId || !show) return false;
  if (show.id !== showId || show.deletedAt) return false;
  if (!show.startDate || !show.endDate) return false;
  const today = calendarDateInTimeZone(now, getEntryWindowTimezone(trials));
  if (today < show.startDate || today > show.endDate) return false;

  // Like the RPC, a soft-deleted dog admits nobody: not its owner or co-owner,
  // and not the handler of an entry for it.
  const deletedDogIds = new Set(
    dogs.filter(dog => dog.deletedAt ?? dog.deleted_at).map(dog => dog.id)
  );
  const ownedDogIds = new Set(
    dogs
      .filter(dog => !deletedDogIds.has(dog.id))
      .filter(dog => dog.ownerId === personId || dog.coOwnerId === personId)
      .map(dog => dog.id)
  );
  return entries.some(entry => {
    if (entry.showId !== showId) return false;
    if (entry.deletedAt ?? entry.deleted_at) return false;
    if (entry.dogId && deletedDogIds.has(entry.dogId)) return false;
    if (INACTIVE_ENTRY_STATUSES.has(entry.entryStatus ?? '')) return false;
    return entry.handlerId === personId || (entry.dogId ? ownedDogIds.has(entry.dogId) : false);
  });
}
