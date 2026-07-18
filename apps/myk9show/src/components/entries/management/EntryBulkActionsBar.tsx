/**
 * EntryBulkActionsBar — sticky bottom bar for the Entry Management table multi-select.
 *
 * Operates on the selected entries, applying each action only to the subset it can
 * validly affect (see {@link getEligibleForBulkAction}). Routes to the existing bulk
 * mutation handlers — no new mutation machinery. Mirrors the ResultsControlPage
 * BulkOperationsBar pattern while using the canonical overflow action menu.
 */

import { Button } from '@/components/ui/button';
import type { EntryStatus } from '@/types/show-registration-types';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { EntryBulkActionMenu } from './EntryBulkActionMenu';

interface EntryBulkActionsBarProps {
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  /** True while a bulk batch is in flight — disables the bulk controls until it settles. */
  busy?: boolean;
}

export function EntryBulkActionsBar({
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
  busy = false,
}: EntryBulkActionsBarProps) {
  if (selectedEntries.length === 0) return null;

  const count = selectedEntries.length;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg"
      role="region"
      aria-label="Bulk entry actions"
    >
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">
            {count} entr{count === 1 ? 'y' : 'ies'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
            Clear
          </Button>
        </div>
        <EntryBulkActionMenu
          selectedEntries={selectedEntries}
          onBulkStatusChange={onBulkStatusChange}
          onBulkCheckIn={onBulkCheckIn}
          onClear={onClear}
          disabled={busy}
        />
      </div>
    </div>
  );
}

export default EntryBulkActionsBar;
