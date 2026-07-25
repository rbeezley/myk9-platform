import type { EntityAction } from '@/components/ui/RowActionMenu/entityActions';
import type { EntryActionHandlers } from '@/components/entries/management/entryActions';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { CommandMenuCommand, CommandMenuContext } from './commandMenuTypes';

const CHECK_IN_ACTION_ID = 'check-in';

/**
 * Parity mechanism (design.md Decision 3 / "Context plumbing"): the command
 * palette never carries selected-entry OBJECTS, only IDs (`selectedEntryIds`
 * / `eligibleCheckInIds`, precomputed by the owner page via
 * `getEligibleForBulkAction`) — so it cannot call `toBulkActions` directly,
 * which requires `TItem[]`. Instead this builder looks up the SAME
 * `entryActions` registry entry by id ('check-in') and reuses its own
 * `bulk.label(eligibleCount, selectedCount)` for copy, while the actual
 * mutation is delegated to `ctx.runBulkCheckIn` — the page's registered
 * handler (`handleEnrollmentBulkCheckIn`), the identical handler the bulk
 * action bar invokes. This satisfies handler-parity by construction: same
 * action id, same label source, same handler — without reimplementing
 * eligibility or duplicating `toBulkActions`' projection logic.
 */
export function buildCheckInCommand(
  ctx: CommandMenuContext | null,
  registry: ReadonlyArray<EntityAction<EntryManagementEntry, EntryActionHandlers>>
): CommandMenuCommand | null {
  if (!ctx) return null;
  if (ctx.surface !== 'entry-management') return null;
  if (ctx.busy) return null;
  if (ctx.selectedEntryIds.length === 0) return null;
  if (ctx.eligibleCheckInIds.length === 0) return null;

  const checkInAction = registry.find(action => action.id === CHECK_IN_ACTION_ID);
  if (!checkInAction?.bulk) return null;

  const eligibleIds = ctx.eligibleCheckInIds;
  const label = checkInAction.bulk.label(eligibleIds.length, ctx.selectedEntryIds.length);

  return {
    id: CHECK_IN_ACTION_ID,
    group: 'actions',
    label,
    sublabel: 'Selected entries',
    showScope: ctx.showId,
    run: () => ctx.runBulkCheckIn(eligibleIds),
  };
}
