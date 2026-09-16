/**
 * dogActions — the dogs domain's `EntityAction` catalog (design.md decision D1).
 *
 * Bulk-only: the only consumer is `DogsBulkActionsBar` (rendered from
 * `BrowseDogsPage`, above both `DogsGridView` and `DogsTableView`) via
 * `toBulkActions`. There is no per-row menu on /dogs (MYK9-587 decided against
 * one); `DogListRow`, the catalog's former row consumer, was deleted as dead
 * code (MYK9-588). Status changes call `useUpdateDogMutation`; delete calls
 * `useDeleteDogMutation`. Dogs are not part of the offline replication layer,
 * so calling the React Query mutation hooks directly (via injected handlers)
 * is correct here.
 *
 * `EntityAction` still requires a top-level `applicableWhen`/`run` (shared
 * with domains that DO have a row menu, e.g. classes/entries) even though
 * nothing calls `toRowActions` for dogs — they're unreachable stubs below.
 */
import { CheckCircle2, HeartPulse, PawPrint, Trash2 } from 'lucide-react';
import type { EntityAction } from '@/components/ui/RowActionMenu';
import type { Dog, DogStatus } from '@/types/dog-types';

export interface DogActionHandlers {
  /**
   * Bulk bar: change every eligible dog's status in ONE dispatch. A per-dog
   * call would trip the dispatch in-flight latch and only update the first
   * dog, which is why this takes the whole eligible subset at once.
   */
  onBulkSetStatus?: ((dogs: Dog[], status: DogStatus) => void) | undefined;
  /** Bulk bar: opens the multi-dog delete confirmation with the eligible subset. */
  onBulkDelete?: ((dogs: Dog[]) => void) | undefined;
}

const STATUS_LABEL: Record<DogStatus, string> = {
  active: 'Active',
  retired: 'Retired',
  deceased: 'Deceased',
};

/**
 * "3 dogs", or "2 of 3 dogs" when part of the selection cannot take the action.
 * In the "X of Y" form the noun agrees with Y, so 1-of-2 reads "1 of 2 dogs".
 */
function dogCountPhrase(eligibleCount: number, selectedCount: number): string {
  if (eligibleCount === selectedCount) {
    return `${eligibleCount} ${eligibleCount === 1 ? 'dog' : 'dogs'}`;
  }
  return `${eligibleCount} of ${selectedCount} ${selectedCount === 1 ? 'dog' : 'dogs'}`;
}

function makeStatusAction(
  status: DogStatus,
  icon: React.ReactNode
): EntityAction<Dog, DogActionHandlers> {
  return {
    id: `set-status-${status}`,
    label: `Mark ${STATUS_LABEL[status].toLowerCase()}`,
    sectionLabel: 'Status',
    icon,
    // Unreachable: no row consumer remains for dogs (see file header).
    applicableWhen: () => false,
    run: () => undefined,
    bulk: {
      applicableWhen: (dog, handlers) =>
        Boolean(handlers.onBulkSetStatus) && (dog.status ?? 'active') !== status,
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0
          ? `Mark ${dogCountPhrase(eligibleCount, selectedCount)} ${STATUS_LABEL[status].toLowerCase()}`
          : `Mark ${STATUS_LABEL[status].toLowerCase()}`,
      unavailableReason: `No selected dogs can be marked ${STATUS_LABEL[status].toLowerCase()}`,
      run: (eligible, handlers) => handlers.onBulkSetStatus?.(eligible, status),
    },
  };
}

/** Dogs domain's shared action catalog (design.md decision D1), bulk-only —
 * see file header. Status changes apply whenever the dog isn't already in the
 * target status, and delete applies to every selected dog. */
export const dogActions: ReadonlyArray<EntityAction<Dog, DogActionHandlers>> = [
  makeStatusAction('active', <CheckCircle2 className="h-4 w-4" />),
  makeStatusAction('retired', <PawPrint className="h-4 w-4" />),
  makeStatusAction('deceased', <HeartPulse className="h-4 w-4" />),
  {
    id: 'delete',
    label: 'Delete dog',
    sectionLabel: 'Danger zone',
    icon: <Trash2 className="h-4 w-4" />,
    variant: 'destructive',
    // Unreachable: no row consumer remains for dogs (see file header).
    applicableWhen: () => false,
    run: () => undefined,
    bulk: {
      applicableWhen: (_dog, handlers) => Boolean(handlers.onBulkDelete),
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0 ? `Delete ${dogCountPhrase(eligibleCount, selectedCount)}` : 'Delete',
      unavailableReason: 'No selected dogs can be deleted',
      run: (eligible, handlers) => handlers.onBulkDelete?.(eligible),
    },
  },
];
