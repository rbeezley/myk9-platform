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
  onSetStatus?: ((dog: Dog, status: DogStatus) => void) | undefined;
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
      label: (eligibleCount, selectedCount) =>
        eligibleCount > 0
          ? `Mark ${STATUS_LABEL[status].toLowerCase()} ${eligibleCount} of ${selectedCount} selected`
          : `Mark ${STATUS_LABEL[status].toLowerCase()}`,
      unavailableReason: `No selected dogs can be marked ${STATUS_LABEL[status].toLowerCase()}`,
      run: (eligible, handlers) => {
        eligible.forEach(dog => handlers.onSetStatus?.(dog, status));
      },
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
        eligibleCount > 0 ? `Delete ${eligibleCount} of ${selectedCount} selected` : 'Delete',
      unavailableReason: 'No selected dogs can be deleted',
      run: (eligible, handlers) => handlers.onBulkDelete?.(eligible),
    },
  },
];
