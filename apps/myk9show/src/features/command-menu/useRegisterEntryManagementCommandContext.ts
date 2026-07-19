import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEligibleForBulkAction } from '@/components/entries/management/bulkActionEligibility';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { registerCommandMenuContext } from './commandMenuContextStore';

export interface UseRegisterEntryManagementCommandContextInput {
  showId: string | null | undefined;
  /** Current trial filter, if any — omitted (undefined) when no trial is
   * selected, per the registered `CommandMenuContext.trialId` contract. */
  trialId: string | null | undefined;
  /** The page's existing bulk check-in handler — the SAME handler the bulk
   * action bar calls (`handleEnrollmentBulkCheckIn`), so the palette command
   * dispatches through the identical mutation path (design.md Decision 3). */
  runBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  /** True while a bulk mutation from this page is in flight. */
  busy: boolean;
}

export interface UseRegisterEntryManagementCommandContextResult {
  /** Pass to `RegistrationView`'s `onSelectionChange` — reports the current
   * multi-select bar selection into the command-menu context. */
  onSelectionChange: (selectedEntries: EntryManagementEntry[]) => void;
}

/**
 * Registers Entry Management's command-menu context (task: context
 * registration in `EntryManagementPage.tsx`) on mount and whenever its
 * inputs change, unregistering on unmount/change. Eligibility uses the SAME
 * `getEligibleForBulkAction(selectedEntries, 'check-in')` the bulk action
 * bar uses, so the palette's "Check in selected entries" command can never
 * offer a wider eligible set than the bulk bar would.
 *
 * Owns the reported-selection state so the page only wires two lines: call
 * the hook, pass `onSelectionChange` down. useBulkSelection's
 * onSelectionChange effect emits a FRESH array whenever the filtered-entries
 * identity changes (even with identical contents), so the setter preserves
 * the previous reference when nothing actually changed — otherwise
 * render → effect → setState would loop unboundedly.
 */
export function useRegisterEntryManagementCommandContext({
  showId,
  trialId,
  runBulkCheckIn,
  busy,
}: UseRegisterEntryManagementCommandContextInput): UseRegisterEntryManagementCommandContextResult {
  const [selectedEntries, setSelectedEntries] = useState<EntryManagementEntry[]>([]);

  const onSelectionChange = useCallback((entries: EntryManagementEntry[]) => {
    setSelectedEntries(prev =>
      prev.length === entries.length && prev.every((entry, i) => entry === entries[i])
        ? prev
        : entries
    );
  }, []);

  const eligibleCheckInIds = useMemo(
    () => getEligibleForBulkAction(selectedEntries, 'check-in').map(entry => entry.id),
    [selectedEntries]
  );
  const selectedEntryIds = useMemo(
    () => selectedEntries.map(entry => entry.id),
    [selectedEntries]
  );

  useEffect(() => {
    if (!showId) return undefined;

    return registerCommandMenuContext({
      surface: 'entry-management',
      showId,
      trialId: trialId ?? undefined,
      selectedEntryIds,
      eligibleCheckInIds,
      // Context contract takes readonly ids; the page handler takes string[].
      // Copy at the boundary — same ids, same handler.
      runBulkCheckIn: ids => Promise.resolve(runBulkCheckIn([...ids])),
      busy,
    });
  }, [showId, trialId, selectedEntryIds, eligibleCheckInIds, runBulkCheckIn, busy]);

  return { onSelectionChange };
}
