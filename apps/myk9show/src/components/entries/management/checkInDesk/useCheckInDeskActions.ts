import { useCallback, useState } from 'react';
import type { CheckInStatus } from '@myk9/core';
import { dispatchBulk } from '@/hooks/bulkDispatch';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import type { DeskStatusChange } from './checkInDeskModel';
import { deskStatusLabel } from './peopleRoster';

/** What the writes need from an entry to know the status it is changing from. */
export interface DeskStatusSource {
  id: string;
  classes: readonly { checkInStatus?: CheckInStatus | undefined }[];
}

/**
 * Status writes for the Check-in desk (check in, Conflict, undo): the replicated path
 * (offline-safe), bounded by `dispatchBulk` so an exhibitor with a dozen entries does not fire a
 * dozen simultaneous writes. Succeeded ids show their new status at once and are held until the
 * page's entries re-read lands (`onRefreshEntries`); from then on the shared entries speak for
 * themselves. If the re-read fails the flip stays, but only while the shared status still reads
 * as it did before the write (`applyOptimisticDeskStatuses`), so a later change is never masked.
 */
export function useCheckInDeskActions(
  /** The shared entries, never the optimistic view: `from` must be what the shared data says. */
  entries: readonly DeskStatusSource[],
  onRefreshEntries?: () => void | Promise<void>
) {
  const [changes, setChanges] = useState<ReadonlyMap<string, DeskStatusChange>>(new Map());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** The entries the last failed write was about, so the error shows on their dog's card. */
  const [errorIds, setErrorIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // A held flip is only about the status it was made from. Once the shared entries read as
  // something else, it is spent, so it cannot re-apply if the status later returns to `from`.
  const spent = [...changes].filter(([entryId, change]) => {
    const source = entries.find(entry => entry.id === entryId);
    return (
      source !== undefined && (source.classes[0]?.checkInStatus ?? 'no-status') !== change.from
    );
  });
  if (spent.length > 0) {
    setChanges(current => {
      const next = new Map(current);
      spent.forEach(([entryId]) => next.delete(entryId));
      return next;
    });
  }

  /** Sets `status` on each entry; `subject` names who or what in the messages ("Alice Martin"). */
  const setStatus = useCallback(
    async (subject: string, entryIds: readonly string[], status: CheckInStatus) => {
      if (entryIds.length === 0) return;
      // What each class shows in the shared entries now (one entry row is one class).
      const shared = new Map(entries.map(entry => [entry.id, entry]));
      const targets = entryIds.map(entryId => ({
        entryId,
        from: shared.get(entryId)?.classes[0]?.checkInStatus ?? ('no-status' as CheckInStatus),
      }));
      setError(null);
      setErrorIds(new Set());
      setNotice(null);
      setBusyIds(current => new Set([...current, ...entryIds]));
      const outcome = await dispatchBulk([...entryIds], async entryId => {
        await updateReplicatedCheckInStatus(entryId, status);
      });
      const done = new Set(outcome.succeeded);
      const applied = targets.filter(target => done.has(target.entryId));
      if (applied.length > 0) {
        const flips = new Map(applied.map(({ entryId, from }) => [entryId, { from, to: status }]));
        setChanges(current => {
          const next = new Map(current);
          flips.forEach((flip, entryId) => next.set(entryId, flip));
          return next;
        });
        // Without a re-read there is nothing to hand over to, so the flip stays.
        if (onRefreshEntries) {
          void Promise.resolve()
            .then(onRefreshEntries)
            .then(() => {
              setChanges(current => {
                const next = new Map(current);
                applied.forEach(({ entryId }) => {
                  if (next.get(entryId) === flips.get(entryId)) next.delete(entryId);
                });
                return next;
              });
            })
            .catch(() => {
              // The re-read failed: keep the flip rather than show the change as undone.
            });
        }
      }
      const checkingIn = status === 'checked-in';
      if (applied.length !== targets.length) {
        setErrorIds(new Set(entryIds.filter(id => !done.has(id))));
        setError(
          applied.length > 0
            ? `${checkingIn ? 'Checked in' : 'Updated'} ${applied.length} of ${targets.length} for ${subject}.`
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
    [entries, onRefreshEntries]
  );

  return { changes, busyIds, error, errorIds, notice, setStatus };
}
