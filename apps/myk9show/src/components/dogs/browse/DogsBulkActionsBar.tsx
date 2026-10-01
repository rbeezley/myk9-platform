/**
 * DogsBulkActionsBar — the dogs browse table's multi-select bulk bar
 * (design.md decision D2/D3, tasks.md slice 3.4), on the shared list-toolkit
 * `FloatingBulkBar` shell (MYK9-796) with a `RowActionMenu` resolved from
 * `dogActions` as its one action trigger. Status-change actions dispatch
 * directly through `useUpdateDogMutation`; delete opens the shared
 * `DeleteObjectDialog` (counts, paid/scored blockers named up front, Undo).
 */
import { useRef, useState, useEffect } from 'react';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { FloatingBulkBar } from '@/components/list-toolkit';
import { useUpdateDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { getDogDisplayName, type Dog, type DogStatus } from '@/types/dog-types';
import { dogActions } from '@/components/dogs/common/dogActions';
import { DeleteObjectDialog, dogDeleteDetail } from '@/features/delete';

const DOG_NOUN = ['dog', 'dogs'] as const;

interface DogsBulkActionsBarProps {
  selectedDogs: Dog[];
  onClear: () => void;
  /**
   * Whether the current user may delete dogs (`dog:delete`). When false the bulk
   * Delete action is not offered at all — status changes (`dog:update`) remain.
   * Per-dog ownership rejections still surface as honest partial-failures.
   */
  canDelete?: boolean;
}

export function DogsBulkActionsBar({
  selectedDogs,
  onClear,
  canDelete = false,
}: DogsBulkActionsBarProps) {
  const updateDogMutation = useUpdateDogMutation();
  const [pendingDelete, setPendingDelete] = useState<Dog[] | null>(null);

  const statusDispatch = useBulkDispatch<Dog>({ getLabel: getDogDisplayName });

  // Latest selected-dog snapshot, read at RETRY time (which fires later, from the
  // toast) so a retry re-checks fresh status rather than the objects captured when
  // the batch was first dispatched. Updated in an effect (not during render) per
  // react-hooks/refs.
  const selectedDogsRef = useRef(selectedDogs);
  useEffect(() => {
    selectedDogsRef.current = selectedDogs;
  }, [selectedDogs]);

  // Nothing selected means nothing to act on.
  if (selectedDogs.length === 0) return null;

  const count = selectedDogs.length;

  const handleBulkSetStatus = (dogs: Dog[], status: DogStatus) => {
    void (async () => {
      // One dispatch for the whole eligible subset — a per-dog call would trip
      // the in-flight latch and only update the first dog.
      await statusDispatch.run(
        dogs,
        async d => {
          await updateDogMutation.mutateAsync({ id: d.id, updates: { status } });
        },
        {
          onFullSuccess: onClear,
          // On retry, re-read the dog's CURRENT status from the freshest snapshot
          // and skip any already in the target status (e.g. another user set it
          // meanwhile) rather than re-writing it.
          applicableWhen: d => {
            const fresh = selectedDogsRef.current.find(x => x.id === d.id) ?? d;
            return (fresh.status ?? 'active') !== status;
          },
        }
      );
    })();
  };

  const handleBulkDelete = (dogs: Dog[]) => setPendingDelete(dogs);

  const actions = toBulkActions(
    selectedDogs,
    // eslint-disable-next-line react-hooks/refs -- handleBulkSetStatus reads selectedDogsRef only inside the async retry (an event-handler path), never during render; toBulkActions stores it as onSelect and does not invoke it while rendering.
    { onBulkSetStatus: handleBulkSetStatus, onBulkDelete: handleBulkDelete },
    dogActions
    // Hide Delete entirely when the user lacks `dog:delete` — showing it disabled
    // with "no dogs can be deleted" would misattribute a permission gate to
    // eligibility. Status changes (dog:update) remain.
  ).filter(action => canDelete || action.id !== 'delete');

  const isBusy = statusDispatch.isBusy;

  return (
    <>
      <FloatingBulkBar count={count} noun={DOG_NOUN} onClear={onClear} busy={isBusy}>
        <RowActionMenu actions={actions} size="touch" label="Bulk actions" disabled={isBusy} />
      </FloatingBulkBar>

      {pendingDelete !== null && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) setPendingDelete(null);
          }}
          kind="dog"
          targets={pendingDelete.map(dog => ({
            id: dog.id,
            name: getDogDisplayName(dog),
            detail: dogDeleteDetail({ callName: dog.callName, ownerName: dog.ownerName }),
          }))}
          onDeleted={() => onClear()}
        />
      )}
    </>
  );
}

export default DogsBulkActionsBar;
