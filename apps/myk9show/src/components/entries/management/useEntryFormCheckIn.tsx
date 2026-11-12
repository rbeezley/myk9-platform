import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionMenu';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import { buildCheckInDeskClasses, eligibleCheckInEntryIds } from './checkInDesk/checkInDeskModel';
import { useCheckInDeskActions } from './checkInDesk/useCheckInDeskActions';
import { useMinuteClock } from './checkInDesk/useMinuteClock';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/storedEntryPatch';

export interface EntryFormCheckIn {
  /** Entries the Check-in desk would offer "Check in" for right now (show day, accepted, not yet in). */
  eligibleIds: ReadonlySet<string>;
  busyIds: ReadonlySet<string>;
  error: string | null;
  /** The schedule behind eligibility failed to read: no eligibility is known, so never "All set". */
  scheduleFailed: boolean;
  retrySchedule: () => void;
  checkIn: (personName: string, entryIds: readonly string[]) => Promise<void>;
}

/**
 * Check-in on the entry form (MYK9-1691). The same replicated write and the same eligibility
 * as the Check-in desk (`useCheckInDeskActions`, `eligibleCheckInEntryIds` over the desk's own
 * roster rules); nothing here decides who may be checked in.
 */
export function useEntryFormCheckIn(
  showId: string,
  entries: readonly EntryManagementEntry[],
  onRefreshEntries?: EntriesRefresh
): EntryFormCheckIn {
  const now = useMinuteClock();
  const { trials, trialClasses, readFailed, retry } = useShowDeskScheduleRead();
  const { busyIds, error, setStatus } = useCheckInDeskActions(onRefreshEntries);

  const classes = useMemo(
    () =>
      buildCheckInDeskClasses(
        trials.filter(trial => trial.showId === showId),
        trialClasses
      ),
    [showId, trialClasses, trials]
  );
  const eligibleIds = useMemo(
    () => eligibleCheckInEntryIds(entries, classes, now),
    [classes, now, entries]
  );
  return {
    eligibleIds,
    busyIds,
    error,
    scheduleFailed: readFailed,
    retrySchedule: () => void retry(),
    checkIn: (personName, entryIds) => setStatus(personName, entryIds, 'checked-in'),
  };
}

const EntryFormCheckInContext = createContext<EntryFormCheckIn | null>(null);

/** Hands the form's check-in to its entry rows without threading props through the enrollment card. */
export function EntryFormCheckInProvider({
  value,
  children,
}: {
  value: EntryFormCheckIn;
  children: ReactNode;
}) {
  return (
    <EntryFormCheckInContext.Provider value={value}>{children}</EntryFormCheckInContext.Provider>
  );
}

/**
 * The row menu's "Check in" for one entry: present only on an entry form, on a show day, for an
 * eligible entry. Elsewhere (no provider) it is always hidden.
 */
export function useEntryFormCheckInAction(): (entry: EntryManagementEntry) => RowAction {
  const form = useContext(EntryFormCheckInContext);
  return entry => ({
    id: 'check-in',
    label: 'Check in',
    icon: <ClipboardCheck />,
    onSelect: () => void form?.checkIn(entry.dogName, [entry.id]),
    disabled: Boolean(form?.busyIds.has(entry.id)),
    hidden: !form?.eligibleIds.has(entry.id),
  });
}

/** "Checked in" beside a class on an entry form; nothing elsewhere or for any other status. */
export function EntryFormCheckedInChip({ cls }: { cls: EntryClass }) {
  const form = useContext(EntryFormCheckInContext);
  if (!form || cls.checkInStatus !== 'checked-in') return null;
  return <CheckInStatusIndicator status="checked-in" size="sm" showLabel showTooltip={false} />;
}
