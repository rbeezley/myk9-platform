import { useState, type ReactNode } from 'react';

import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { DeskPullDialogs } from '@/components/entries/management/checkInDesk/DeskPullDialogs';
import { changeDeskRowStatus } from '@/components/entries/management/checkInDesk/deskRowStatus';
import {
  DESK_CHECK_IN_STATUSES,
  DESK_STATUS_LABELS,
  deskUnpullState,
} from '@/components/entries/management/checkInDesk/deskStatus';
import { useCheckInDeskActions } from '@/components/entries/management/checkInDesk/useCheckInDeskActions';
import {
  useDeskPull,
  type DeskPullRow,
} from '@/components/entries/management/checkInDesk/useDeskPull';

import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';

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
  onRefreshEntries?: EntriesRefresh,
  /**
   * The stored entries by id (MYK9-2038): what Put back needs to read the rule and to write
   * through the desk's own put-back path. Absent, no Put back is offered.
   */
  putBackEntries?: ReadonlyMap<string, EntryManagementEntry>
) {
  const { busyIds, error, errorIds, notice, setStatus } = useCheckInDeskActions(onRefreshEntries);
  // The panel is reused across classes, so an alert shows only beside the class whose dog it is
  // about.
  const errorHere = error !== null && entries.some(entry => errorIds.has(entry.entryId));
  const rowOf = (entryId: string): DeskPullRow | undefined => {
    const entry = entries.find(candidate => candidate.entryId === entryId);
    if (!entry) return undefined;
    const source = putBackEntries?.get(entryId);
    const cls = source?.classes[0];
    // The Check-in desk's rule, read the same way (`deskUnpullState`), on any day.
    const unpull = source && cls ? deskUnpullState(source, cls) : undefined;
    return {
      entryId,
      dogName: entry.dogName,
      className,
      armband: entry.armband ?? null,
      deskStatusEditable: canChange && entry.deskEditable,
      deskCanUnpull: canChange && (unpull?.canUnpull ?? false),
      putBackReason: canChange ? (unpull?.blockedReason ?? null) : null,
      sourceEntry: source,
    };
  };
  const pull = useDeskPull(rowOf, onRefreshEntries, 'Pulled at Show Desk');
  const [pickerId, setPickerId] = useState<string | null>(null);
  // The row as it is now: if ringside moves it on, the picker closes rather than write over it.
  const pickerEntry = entries.find(
    entry => entry.entryId === pickerId && canChange && entry.deskEditable
  );
  if (pickerId && !pickerEntry) setPickerId(null);

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
          currentStatus={pickerEntry.checkInValue}
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
    isBusy: (entryId: string) => busyIds.has(entryId),
    open: (entryId: string) => setPickerId(entryId),
    /** The row's Put back (MYK9-2038): whether it is offered, and why not when it is a locked Pull. */
    putBackOf: (entryId: string) => {
      const row = rowOf(entryId);
      return row ? { canUnpull: row.deskCanUnpull, reason: row.putBackReason ?? null, row } : null;
    },
    requestUnpull: pull.requestUnpull,
    dialogs,
  };
}

export type ClassCheckIn = ReturnType<typeof useClassCheckIn>;
