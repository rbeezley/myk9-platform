import { useCallback, useState } from 'react';
import type { CheckInStatus } from '@myk9/core';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { refreshWithoutWaiting } from './refreshWithoutWaiting';
import { deskStatusLabel } from './peopleRoster';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/storedEntryPatch';

/**
 * Status writes for the Check-in desk (check in, Conflict, undo): the replicated path
 * (offline-safe), bounded by `dispatchBulk` so an exhibitor with a dozen entries does not fire a
 * dozen simultaneous writes. A control frees as soon as its write is stored; the page's entries
 * re-read (`onRefreshEntries`) is started but never awaited (`refreshWithoutWaiting`), and the
 * shared entries are the only status shown, with no local copy of a status beside them.
 */
export function useCheckInDeskActions(onRefreshEntries?: EntriesRefresh) {
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** The entries the last failed write was about, so the error shows on their dog's card. */
  const [errorIds, setErrorIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  /** Sets `status` on each entry; `subject` names who or what in the messages ("Alice Martin"). */
  const setStatus = useCallback(
    async (subject: string, entryIds: readonly string[], status: CheckInStatus) => {
      if (entryIds.length === 0) return;
      setError(null);
      setErrorIds(new Set());
      setNotice(null);
      setBusyIds(current => new Set([...current, ...entryIds]));
      const outcome = await dispatchBulk([...entryIds], async entryId => {
        await updateReplicatedCheckInStatus(entryId, status);
      });
      const done = new Set(outcome.succeeded);
      const applied = entryIds.filter(entryId => done.has(entryId));
      if (applied.length > 0) {
        refreshWithoutWaiting(
          onRefreshEntries,
          applied.map(entryId => ({ entryId, checkInStatus: status }))
        );
      }
      const checkingIn = status === 'checked-in';
      if (applied.length !== entryIds.length) {
        setErrorIds(new Set(entryIds.filter(id => !done.has(id))));
        setError(
          applied.length > 0
            ? `${checkingIn ? 'Checked in' : 'Updated'} ${applied.length} of ${entryIds.length} for ${subject}.`
            : `Couldn't ${checkingIn ? 'check in' : 'update'} ${subject}. Try again.`
        );
      } else {
        const count = `${applied.length} ${applied.length === 1 ? 'class' : 'classes'}`;
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

  return { busyIds, error, errorIds, notice, setStatus };
}
