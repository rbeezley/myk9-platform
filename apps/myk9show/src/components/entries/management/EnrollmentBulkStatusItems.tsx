import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { getEligibleForBulkStatusChange } from './bulkActionEligibility';
import { BULK_STATUSES } from './bulkStatusCatalog';
import { BULK_COMMAND_LABELS } from './reviewStateLabels';

/**
 * The status changes the registration Actions menu offers, in menu order.
 * `SCRATCHED` (Pull) is deliberately absent: pulling is per-entry because it
 * carries refund nuance, matching `bulkActionEligibility`'s note that
 * withdraw/refund stays off the bulk bar.
 */
interface EnrollmentBulkStatusItemsProps {
  entries: EntryManagementEntry[];
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
}

/**
 * "Accept all" / "Reject all" for one registration.
 *
 * These commands used to pass every entry in the registration, unfiltered, to
 * the shared bulk handler — including entries that `bulkActionEligibility` says
 * a bulk status change "must never" touch (completed, scratched, moved,
 * cancelled, move-up-requested). The handler now enforces that rule itself, so
 * the write is safe either way; what this component adds is TRUTH IN THE LABEL.
 *
 * "Accept all" on a registration where one of five entries is already scored
 * would silently act on four. The multi-select toolbar has always said
 * "Accept 3 of 5 selected" in that situation; saying nothing here meant the
 * same action reported its scope in one place and concealed it in another.
 */
export function EnrollmentBulkStatusItems({
  entries,
  onBulkStatusChange,
}: EnrollmentBulkStatusItemsProps) {
  return (
    <>
      {BULK_STATUSES.map(status => {
        const eligible = getEligibleForBulkStatusChange(entries, status);
        const isPartial = eligible.length > 0 && eligible.length < entries.length;
        return (
          <DropdownMenuItem
            key={status}
            disabled={eligible.length === 0}
            onClick={() =>
              onBulkStatusChange(
                eligible.map(entry => entry.id),
                status
              )
            }
          >
            {BULK_COMMAND_LABELS[status]}
            {isPartial && (
              <span className="ml-2 text-xs text-muted-foreground">
                {eligible.length} of {entries.length}
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
