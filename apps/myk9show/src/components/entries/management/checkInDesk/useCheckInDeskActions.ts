import { useCallback, useState } from 'react';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

/**
 * Check-in writes for the Check-in desk: the replicated path (offline-safe), bounded by
 * `dispatchBulk` so an exhibitor with a dozen entries does not fire a dozen simultaneous writes.
 * Succeeded ids flip the rows at once and are held only until the page's entries re-read lands
 * (`onRefreshEntries`); from then on the shared entries speak for themselves, so a later ringside
 * status is never masked. If the re-read fails the flip stays: the write did succeed.
 */
export function useCheckInDeskActions(onRefreshEntries?: () => void | Promise<void>) {
  const [checkedInIds, setCheckedInIds] = useState<ReadonlySet<string>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkIn = useCallback(
    async (personName: string, entryIds: readonly string[]) => {
      if (entryIds.length === 0) return;
      setError(null);
      setNotice(null);
      setBusyIds(current => new Set([...current, ...entryIds]));
      const outcome = await dispatchBulk([...entryIds], async entryId => {
        await updateReplicatedCheckInStatus(entryId, 'checked-in');
      });
      const { succeeded } = outcome;
      if (succeeded.length > 0) {
        setCheckedInIds(current => new Set([...current, ...succeeded]));
        // Without a re-read there is nothing to hand over to, so the flip stays.
        if (onRefreshEntries) {
          try {
            await onRefreshEntries();
            setCheckedInIds(current => {
              const next = new Set(current);
              succeeded.forEach(id => next.delete(id));
              return next;
            });
          } catch {
            // The re-read failed: keep the optimistic flip rather than show a check-in as undone.
          }
        }
      }
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
    },
    [onRefreshEntries]
  );

  return { checkedInIds, busyIds, error, notice, checkIn };
}
