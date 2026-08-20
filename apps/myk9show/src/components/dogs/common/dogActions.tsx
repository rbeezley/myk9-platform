/**
 * dogActions — the dogs domain's `EntityAction` catalog (design.md decision D1).
 *
 * Same definitions drive both the per-row `RowActionMenu` (DogListRow) and the
 * `DogsTableView` bulk selection bar via `toRowActions`/`toBulkActions`. Status
 * changes call `useUpdateDogMutation`; delete calls `useDeleteDogMutation`. Dogs
 * are not part of the offline replication layer, so calling the React Query
 * mutation hooks directly (via injected handlers) is correct here.
 */
import { CheckCircle2, HeartPulse, PawPrint, Trash2 } from 'lucide-react';
import type { EntityAction } from '@/components/ui/RowActionMenu';
import type { Dog, DogStatus } from '@/types/dog-types';

export interface DogActionHandlers {
  /** Row menu: change one dog's status. */
  onSetStatus?: ((dog: Dog, status: DogStatus) => void) | undefined;
  /**
   * Bulk bar: change every eligible dog's status in ONE dispatch. Distinct from
   * `onSetStatus` because a per-dog call would trip the dispatch in-flight latch
   * and only update the first dog.
   */
  onBulkSetStatus?: ((dogs: Dog[], status: DogStatus) => void) | undefined;
  /** Row menu: opens the single-dog delete confirmation. */
  onDelete?: ((dog: Dog) => void) | undefined;
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
    applicableWhen: (dog, handlers) =>
      Boolean(handlers.onSetStatus) && (dog.status ?? 'active') !== status,
    run: (dog, handlers) => handlers.onSetStatus?.(dog, status),
    bulk: {
      // Bulk uses `onBulkSetStatus` (one dispatch for the whole eligible subset),
      // not the row's per-dog `onSetStatus` — so eligibility gates on that handler.
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

/** Dogs domain's shared action catalog (design.md decision D1). Row and bulk
 * eligibility are identical here — status changes apply whenever the dog isn't
 * already in the target status, and delete applies to every selected dog. */
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
    applicableWhen: (_dog, handlers) => Boolean(handlers.onDelete),
    run: (dog, handlers) => handlers.onDelete?.(dog),
    bulk: {
      // Bulk dispatches through `onBulkDelete` (opens the multi-dog confirm
      // dialog), a different handler than the row menu's `onDelete` — so bulk
      // eligibility checks `onBulkDelete`, not the row `applicableWhen` default.
      applicableWhen: (_dog, handlers) => Boolean(handlers.onBulkDelete),
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0 ? `Delete ${dogCountPhrase(eligibleCount, selectedCount)}` : 'Delete',
      unavailableReason: 'No selected dogs can be deleted',
      run: (eligible, handlers) => handlers.onBulkDelete?.(eligible),
    },
  },
];
