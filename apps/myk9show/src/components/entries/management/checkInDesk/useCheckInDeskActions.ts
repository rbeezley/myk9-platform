import { useCallback, useState } from 'react';
import type { CheckInStatus } from '@myk9/core';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { deskStatusLabel } from './peopleRoster';

/**
 * Status writes for the Check-in desk (check in, Conflict, undo): the replicated path (offline-safe), bounded by
 * `dispatchBulk` so an exhibitor with a dozen entries does not fire a dozen simultaneous writes.
 * Succeeded ids show their new status at once and are held only until the page's entries re-read
 * lands (`onRefreshEntries`); from then on the shared entries speak for themselves, so a later
 * ringside status is never masked. If the re-read fails the flip stays: the write did succeed.
 */
export function useCheckInDeskActions(onRefreshEntries?: () => void | Promise<void>) {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, CheckInStatus>>(new Map());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Sets `status` on each entry; `subject` names who or what in the messages ("Alice Martin"). */
  const setStatus = useCallback(
    async (subject: string, entryIds: readonly string[], status: CheckInStatus) => {
      if (entryIds.length === 0) return;
      setError(null);
      setNotice(null);
      setBusyIds(current => new Set([...current, ...entryIds]));
      const outcome = await dispatchBulk([...entryIds], async entryId => {
        await updateReplicatedCheckInStatus(entryId, status);
      });
      const { succeeded } = outcome;
      if (succeeded.length > 0) {
        setStatuses(current => {
          const next = new Map(current);
          succeeded.forEach(id => next.set(id, status));
          return next;
        });
        // Without a re-read there is nothing to hand over to, so the flip stays.
        if (onRefreshEntries) {
          try {
            await onRefreshEntries();
            setStatuses(current => {
              const next = new Map(current);
              succeeded.forEach(id => {
                if (next.get(id) === status) next.delete(id);
              });
              return next;
            });
          } catch {
            // The re-read failed: keep the optimistic flip rather than show the change as undone.
          }
        }
      }
      const checkingIn = status === 'checked-in';
      if (succeeded.length !== entryIds.length) {
        setError(
          succeeded.length > 0
            ? `${checkingIn ? 'Checked in' : 'Updated'} ${succeeded.length} of ${entryIds.length} for ${subject}.`
            : `Couldn't ${checkingIn ? 'check in' : 'update'} ${subject}. Try again.`
        );
      } else {
        const count = `${succeeded.length} ${succeeded.length === 1 ? 'class' : 'classes'}`;
        setNotice(
          checkingIn
            ? `Checked in ${count} for ${subject}.`
            : `${subject}: ${deskStatusLabel(status)}.`
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

  return { statuses, busyIds, error, notice, setStatus };
}
