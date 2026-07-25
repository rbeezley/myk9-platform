/**
 * Class Management's shared action catalog — one `EntityAction` definition per
 * status transition plus delete, projected into `RowActionMenu` for both the
 * per-row "3-dot" menu and the bulk-selection menu via `toRowActions`/`toBulkActions`.
 *
 * See openspec/changes/inline-bulk-actions-and-editable-status/design.md
 * decisions D1-D3. Bulk status/delete route through `replicatedClassesTable`
 * (verified task 2.1 — the direct `services/database/classes/reads.ts` seam is
 * not replication-backed); handlers here stay thin wiring, the actual dispatch
 * lives in `useClassBulkActions.ts`.
 */

import { CLASS_STATUS } from '@myk9/core';
import type { EntityAction } from '@/components/ui/RowActionMenu';

export interface ClassActionItem {
  id: string;
  name: string | null;
  status: string | null;
}

/** Handlers a class-domain `EntityAction` definition may call. A page wires up
 * only the callbacks it supports; `applicableWhen` treats a missing handler as
 * "not applicable" so the action disappears rather than firing a no-op. */
export interface ClassActionHandlers {
  onStatusChange?: ((classId: string, status: string) => void) | undefined;
  onDelete?: ((classId: string) => void) | undefined;
  onBulkDelete?: ((classIds: string[]) => boolean | Promise<boolean> | undefined) | undefined;
  onBulkStatusChange?:
    | ((
        classIds: string[],
        status: string,
        onFullSuccess?: () => void
      ) => boolean | Promise<boolean> | undefined)
    | undefined;
  onClear?: () => void;
}

const STATUS_VALUES = Object.values(CLASS_STATUS);

/** Runs a bulk handler and clears the selection on success — callback-aware,
 * mirroring entryActions: the dispatcher invokes `onFullSuccess` itself on full
 * success of the INITIAL run OR a later toast retry (useBulkDispatch forwards it
 * into retry summaries), so a retry that finally succeeds still clears. The
 * `cleared` latch prevents double-clearing when the handler both consumed the
 * callback and resolved non-`false`; the fallback covers lightweight handlers
 * that report success without consuming the callback. */
async function runBulkAndClear(
  handlers: ClassActionHandlers,
  action: (onFullSuccess: () => void) => boolean | Promise<boolean> | undefined
): Promise<void> {
  let cleared = false;
  const onFullSuccess = () => {
    cleared = true;
    handlers.onClear?.();
  };
  try {
    const result = await action(onFullSuccess);
    if (result !== false && !cleared) handlers.onClear?.();
  } catch {
    // Parent handler owns user-visible error copy; keep selection so retry is possible.
  }
}

// Status transitions carry a `bulk` block (MYK9-59): bulk status change now
// routes through `applyManualClassStatus` (via `onBulkStatusChange`, dispatched
// in `useClassBulkActions.ts`) — the same canonical replicated mutation the row
// path and Show Map use, so `status_source='manual'` and the per-status timing
// fields are always set. Bulk eligibility matches the row's: not already in the
// target status.
const statusActions: Array<EntityAction<ClassActionItem, ClassActionHandlers>> = STATUS_VALUES.map(
  status => ({
    id: `set-status-${status}`,
    label: `Set to ${status}`,
    sectionLabel: 'Status',
    applicableWhen: (item, handlers) => Boolean(handlers.onStatusChange) && item.status !== status,
    run: (item, handlers) => handlers.onStatusChange?.(item.id, status),
    bulk: {
      applicableWhen: (item, handlers) =>
        Boolean(handlers.onBulkStatusChange) && item.status !== status,
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0 ? `Mark ${eligibleCount} of ${selectedCount} ${status}` : `Mark ${status}`,
      unavailableReason: `No selected classes can be marked ${status}`,
      run: (eligible, handlers) =>
        runBulkAndClear(handlers, onFullSuccess =>
          handlers.onBulkStatusChange?.(
            eligible.map(item => item.id),
            status,
            onFullSuccess
          )
        ),
    },
  })
);

export const classActions: ReadonlyArray<EntityAction<ClassActionItem, ClassActionHandlers>> = [
  ...statusActions,
  {
    id: 'delete',
    label: 'Delete class',
    sectionLabel: 'Danger',
    variant: 'destructive',
    applicableWhen: (_item, handlers) => Boolean(handlers.onDelete),
    run: (item, handlers) => handlers.onDelete?.(item.id),
    bulk: {
      applicableWhen: () => true,
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0 ? `Delete ${eligibleCount} of ${selectedCount} selected` : 'Delete',
      unavailableReason: 'No selected classes can be deleted',
      run: (eligible, handlers) =>
        runBulkAndClear(handlers, () => handlers.onBulkDelete?.(eligible.map(item => item.id))),
    },
  },
];
