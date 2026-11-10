import { useMemo, useState, type ReactNode } from 'react';

import type { CheckInStatus } from '@/types/check-in-types';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { DeskPullDialogs } from '@/components/entries/management/checkInDesk/DeskPullDialogs';
import { changeDeskRowStatus } from '@/components/entries/management/checkInDesk/deskRowStatus';
import {
  DESK_CHECK_IN_STATUSES,
  DESK_STATUS_LABELS,
} from '@/components/entries/management/checkInDesk/deskStatus';
import { useCheckInDeskActions } from '@/components/entries/management/checkInDesk/useCheckInDeskActions';
import {
  useDeskPull,
  type DeskPullRow,
} from '@/components/entries/management/checkInDesk/useDeskPull';

import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';

/**
 * The class table's Check-in cell opens the Check-in desk's own picker (MYK9-1797): the same
 * `StatusPickerDialog`, the same offline-first write (`useCheckInDeskActions`), and the same
 * Pull with its confirmation and Undo (`useDeskPull`). Nothing here decides a rule; the desk's
 * `deskStatusEditableFor` and `deskLockedReason` already did, in `cockpitClassEntries`.
 */
export function useClassCheckIn(
  entries: readonly SecretaryCockpitClassEntry[],
  className: string,
  canChange: boolean,
  onRefreshEntries?: () => void | Promise<void>
) {
  const sources = useMemo(
    () =>
      entries.map(entry => ({
        id: entry.entryId,
        classes: [{ checkInStatus: entry.checkInValue }],
      })),
    [entries]
  );
  const { changes, busyIds, error, errorIds, notice, setStatus } = useCheckInDeskActions(
    sources,
    onRefreshEntries
  );
  // The panel is reused across classes, so an alert shows only beside the class whose dog it is
  // about. The held statuses stay: a write whose re-read failed must survive a look at another
  // class (MYK9-1803).
  const errorHere = error !== null && entries.some(entry => errorIds.has(entry.entryId));
  const rowOf = (entryId: string): DeskPullRow | undefined => {
    const entry = entries.find(candidate => candidate.entryId === entryId);
    if (!entry) return undefined;
    return {
      entryId,
      dogName: entry.dogName,
      className,
      armband: entry.armband ?? null,
      deskStatusEditable: canChange && entry.deskEditable,
      deskCanUnpull: false,
    };
  };
  const pull = useDeskPull(rowOf, onRefreshEntries);
  const [pickerId, setPickerId] = useState<string | null>(null);
  // The row as it is now: if ringside moves it on, the picker closes rather than write over it.
  const pickerEntry = entries.find(
    entry => entry.entryId === pickerId && canChange && entry.deskEditable
  );
  if (pickerId && !pickerEntry) setPickerId(null);

  /** The status shown: the write just made, until the entries speak for themselves. */
  const statusOf = (entry: SecretaryCockpitClassEntry): CheckInStatus => {
    const change = changes.get(entry.entryId);
    return change && change.from === entry.checkInValue ? change.to : entry.checkInValue;
  };

  const dialogs: ReactNode = (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {notice ?? ''}
      </span>
      {errorHere && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {pickerEntry && (
        <StatusPickerDialog
          open
          onOpenChange={open => {
            if (!open) setPickerId(null);
          }}
          entry={{
            entryId: pickerEntry.entryId,
            armband: pickerEntry.armband ?? '',
            dogName: pickerEntry.dogName,
            handlerName: [pickerEntry.handler, className].filter(Boolean).join(' · '),
          }}
          currentStatus={statusOf(pickerEntry)}
          onStatusChange={(_, status) => {
            const row = rowOf(pickerEntry.entryId);
            if (row) changeDeskRowStatus(row, status, { setStatus }, pull);
          }}
          isStaff
          allowedStatuses={DESK_CHECK_IN_STATUSES}
          labels={DESK_STATUS_LABELS}
        />
      )}
      <DeskPullDialogs pull={pull} />
    </>
  );

  return {
    canChange,
    statusOf,
    isBusy: (entryId: string) => busyIds.has(entryId),
    open: (entryId: string) => setPickerId(entryId),
    dialogs,
  };
}

export type ClassCheckIn = ReturnType<typeof useClassCheckIn>;
