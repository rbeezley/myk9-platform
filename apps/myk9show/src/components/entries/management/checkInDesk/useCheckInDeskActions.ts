import { useCallback, useState } from 'react';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

/**
 * Check-in writes for the Check-in desk: the replicated path (offline-safe), bounded by
 * `dispatchBulk` so an exhibitor with a dozen entries does not fire a dozen simultaneous writes.
 * Succeeded ids are kept locally so the rows flip at once, before the next entries reload.
 */
export function useCheckInDeskActions() {
  const [checkedInIds, setCheckedInIds] = useState<ReadonlySet<string>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkIn = useCallback(async (personName: string, entryIds: readonly string[]) => {
    if (entryIds.length === 0) return;
    setError(null);
    setNotice(null);
    setBusyIds(current => new Set([...current, ...entryIds]));
    const outcome = await dispatchBulk([...entryIds], async entryId => {
      await updateReplicatedCheckInStatus(entryId, 'checked-in');
    });
    const { succeeded } = outcome;
    if (succeeded.length > 0) setCheckedInIds(current => new Set([...current, ...succeeded]));
    if (succeeded.length !== entryIds.length) {
      setError(
        succeeded.length > 0
          ? `Checked in ${succeeded.length} of ${entryIds.length} for ${personName}.`
          : `Couldn't check in ${personName}. Try again.`
      );
    } else {
      setNotice(
        `Checked in ${succeeded.length} ${succeeded.length === 1 ? 'entry' : 'entries'} for ${personName}.`
      );
    }
    setBusyIds(current => {
      const next = new Set(current);
      entryIds.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  return { checkedInIds, busyIds, error, notice, checkIn };
}
