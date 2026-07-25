import { useEffect, useMemo } from 'react';
import { getEligibleForBulkAction } from '@/components/entries/management/bulkActionEligibility';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { registerCommandMenuContext } from './commandMenuContextStore';

export interface UseRegisterEntryManagementCommandContextInput {
  showId: string | null | undefined;
  /** Current trial filter, if any — omitted (undefined) when no trial is
   * selected, per the registered `CommandMenuContext.trialId` contract. */
  trialId: string | null | undefined;
  /** The view's current owner selection. */
  selectedEntries: EntryManagementEntry[];
  /** The page's existing bulk check-in handler — the SAME handler the bulk
   * action bar calls (`handleEnrollmentBulkCheckIn`), so the palette command
   * dispatches through the identical mutation path (design.md Decision 3). */
  runBulkCheckIn: (
    entryIds: string[],
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  /** Clears the Entry Management selection after full success. */
  clearSelection: () => void;
  /** True while a bulk mutation from this page is in flight. */
  busy: boolean;
}

/**
 * Registers Entry Management's command-menu context on mount and whenever its
 * inputs change, unregistering on unmount/change. Eligibility uses the SAME
 * `getEligibleForBulkAction(selectedEntries, 'check-in')` the bulk action
 * bar uses, so the palette's "Check in selected entries" command can never
 * offer a wider eligible set than the bulk bar would.
 */
export function useRegisterEntryManagementCommandContext({
  showId,
  trialId,
  selectedEntries,
  runBulkCheckIn,
  clearSelection,
  busy,
}: UseRegisterEntryManagementCommandContextInput): void {
  const eligibleCheckInIds = useMemo(
    () => getEligibleForBulkAction(selectedEntries, 'check-in').map(entry => entry.id),
    [selectedEntries]
  );
  const selectedEntryIds = useMemo(() => selectedEntries.map(entry => entry.id), [selectedEntries]);

  useEffect(() => {
    if (!showId) return undefined;

    return registerCommandMenuContext({
      surface: 'entry-management',
      showId,
      trialId: trialId ?? undefined,
      selectedEntryIds,
      eligibleCheckInIds,
      // Context contract takes readonly ids; the page handler takes string[].
      // Copy at the boundary and clear the owner selection only after the
      // existing handler reports a completely successful batch.
      runBulkCheckIn: ids => Promise.resolve(runBulkCheckIn([...ids], clearSelection)),
      busy,
    });
  }, [showId, trialId, selectedEntryIds, eligibleCheckInIds, runBulkCheckIn, clearSelection, busy]);
}
