import type { ReplicatedDog, ReplicatedEntry, ReplicatedShow } from '@/services/replication';
import { selectOwnedDogIds } from '@/utils/dogOwnership';

/** Entry states the server RPC `get_account_today_entries` also leaves out. */
const INACTIVE_ENTRY_STATUSES = new Set(['withdrawn', 'scratched']);

/**
 * Does the device already hold an entry of this person's for this show, while
 * the show is on today? Mirrors the server RPC `get_account_today_entries`
 * (20260908134500): the show is live (`startDate <= today <= endDate`,
 * inclusive, not soft-deleted) and the entry is neither withdrawn, scratched
 * nor soft-deleted. Ownership uses the same rule as the replica fallback of
 * `getUserEntries`: the person handles it, or owns its dog.
 *
 * Pure (rows in, boolean out) so it needs no IndexedDB. `today` is a
 * `YYYY-MM-DD` string, which compares correctly as text. Callers pass the UTC
 * calendar date on purpose: the RPC compares the database's `current_date`
 * (UTC on Supabase), and a device-local date would admit for hours each evening
 * that the server then refuses. The RPC's own UTC-date semantics are a separate
 * server-side issue, not changed here.
 */
export function hasLocalEntryForShowToday(input: {
  personId: string | null | undefined;
  showId: string | undefined;
  today: string;
  show: Pick<ReplicatedShow, 'id' | 'startDate' | 'endDate' | 'deletedAt'> | null | undefined;
  entries: readonly ReplicatedEntry[];
  dogs: readonly Pick<ReplicatedDog, 'id' | 'ownerId'>[];
}): boolean {
  const { personId, showId, today, show, entries, dogs } = input;
  if (!personId || !showId || !today || !show) return false;
  if (show.id !== showId || show.deletedAt) return false;
  if (!show.startDate || !show.endDate) return false;
  if (today < show.startDate || today > show.endDate) return false;

  const ownedDogIds = selectOwnedDogIds(dogs, personId);
  return entries.some(entry => {
    if (entry.showId !== showId) return false;
    if (entry.deletedAt ?? entry.deleted_at) return false;
    if (INACTIVE_ENTRY_STATUSES.has(entry.entryStatus ?? '')) return false;
    return entry.handlerId === personId || (entry.dogId ? ownedDogIds.has(entry.dogId) : false);
  });
}
