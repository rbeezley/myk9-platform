import type {
  ReplicatedClass,
  ReplicatedDog,
  ReplicatedEntry,
  ReplicatedShow,
} from '@/services/replication';
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
 * The RPC also leaves out an entry whose class is soft-deleted (a LEFT join,
 * `e.class_id is null or c.deleted_at is null`): an entry is dropped only when
 * its class row is present in `classes` and soft-deleted. A class the device
 * does not hold never excludes an entry; that would be a false "no" for an
 * exhibitor who is entered. The RPC's matching trial rule is deliberately NOT
 * mirrored (MYK9-1441, owner decision): the trials replica drops soft-deleted
 * trials instead of keeping a tombstone, so a deleted trial is indistinguishable
 * from one not yet synced. The brief false admit it leaves is corrected by the
 * server's answer once online.
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
  /** Class rows the device holds for the entries; only their deletion state is read. */
  classes?: readonly Pick<ReplicatedClass, 'id' | 'deletedAt'>[];
}): boolean {
  const { personId, showId, now, trials, show, entries, dogs, classes = [] } = input;
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
  const deletedClassIds = new Set(classes.filter(c => c.deletedAt).map(c => c.id));
  return entries.some(entry => {
    if (entry.showId !== showId) return false;
    if (entry.deletedAt ?? entry.deleted_at) return false;
    if (entry.dogId && deletedDogIds.has(entry.dogId)) return false;
    if (entry.classId && deletedClassIds.has(entry.classId)) return false;
    if (INACTIVE_ENTRY_STATUSES.has(entry.entryStatus ?? '')) return false;
    return entry.handlerId === personId || (entry.dogId ? ownedDogIds.has(entry.dogId) : false);
  });
}
