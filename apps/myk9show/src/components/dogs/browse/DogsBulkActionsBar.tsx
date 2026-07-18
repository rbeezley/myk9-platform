/**
 * DogsBulkActionsBar — sticky bottom bar for the dogs browse table multi-select
 * (design.md decision D2/D3, tasks.md slice 3.4). Follows the
 * `EntryBulkActionsBar` pattern: a count + Clear on the left, a `RowActionMenu`
 * resolved from `dogActions` on the right. Status-change actions dispatch
 * directly through `useUpdateDogMutation`; delete opens a confirmation dialog
 * (destructive, so it keeps the extra step) before dispatching
 * `useDeleteDogMutation` for the confirmed subset.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '@/components/base';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUpdateDogMutation, useDeleteDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { getDogDisplayName, type Dog, type DogStatus } from '@/types/dog-types';
import { dogActions } from '@/components/dogs/common/dogActions';

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
  const { user } = useAuthContext();
  const updateDogMutation = useUpdateDogMutation();
  const deleteDogMutation = useDeleteDogMutation();
  const [pendingDelete, setPendingDelete] = useState<Dog[] | null>(null);

  const statusDispatch = useBulkDispatch<Dog>({ getLabel: getDogDisplayName });
  const deleteDispatch = useBulkDispatch<Dog>({ getLabel: getDogDisplayName });

  // Latest selected-dog snapshot, read at RETRY time (which fires later, from the
  // toast) so a retry re-checks fresh status rather than the objects captured when
  // the batch was first dispatched. Updated in an effect (not during render) per
  // react-hooks/refs.
  const selectedDogsRef = useRef(selectedDogs);
  useEffect(() => {
    selectedDogsRef.current = selectedDogs;
  }, [selectedDogs]);

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

  const confirmBulkDelete = async () => {
    if (!pendingDelete) return;
    const dogs = pendingDelete;
    setPendingDelete(null);
    await deleteDispatch.run(
      dogs,
      async d => {
        await deleteDogMutation.mutateAsync(
          user?.id ? { id: d.id, deletedBy: user.id } : { id: d.id }
        );
      },
      { onFullSuccess: onClear }
    );
  };

  const actions = toBulkActions(
    selectedDogs,
    // eslint-disable-next-line react-hooks/refs -- handleBulkSetStatus reads selectedDogsRef only inside the async retry (an event-handler path), never during render; toBulkActions stores it as onSelect and does not invoke it while rendering.
    { onBulkSetStatus: handleBulkSetStatus, onBulkDelete: handleBulkDelete },
    dogActions
    // Hide Delete entirely when the user lacks `dog:delete` — showing it disabled
    // with "no dogs can be deleted" would misattribute a permission gate to
    // eligibility. Status changes (dog:update) remain.
  ).filter(action => canDelete || action.id !== 'delete');

  const isBusy = statusDispatch.isBusy || deleteDispatch.isBusy;

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg"
        role="region"
        aria-label="Bulk dog actions"
      >
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              {count} dog{count === 1 ? '' : 's'} selected
            </span>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={isBusy}>
              Clear
            </Button>
          </div>
          <RowActionMenu actions={actions} size="touch" label="Bulk actions" disabled={isBusy} />
        </div>
      </div>

      <DeleteConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={() => void confirmBulkDelete()}
        entityName={
          pendingDelete ? `${pendingDelete.length} dog${pendingDelete.length === 1 ? '' : 's'}` : ''
        }
        entityType="Dog"
        isDeleting={deleteDispatch.isBusy}
        warningText="Deleting these dogs also removes their show entries and any related cart items. This action cannot be undone."
      />
    </>
  );
}

export default DogsBulkActionsBar;
