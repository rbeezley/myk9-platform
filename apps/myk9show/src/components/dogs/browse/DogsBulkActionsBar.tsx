/**
 * DogsBulkActionsBar — the dogs browse table's multi-select bulk bar
 * (design.md decision D2/D3, tasks.md slice 3.4), on the shared list-toolkit
 * `FloatingBulkBar` shell (MYK9-796) with a `RowActionMenu` resolved from
 * `dogActions` as its one action trigger. Status-change actions dispatch
 * directly through `useUpdateDogMutation`; delete opens a confirmation dialog
 * (destructive, so it keeps the extra step) before dispatching
 * `useDeleteDogMutation` for the confirmed subset.
 */
import { useRef, useState, useEffect } from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import { RowActionMenu, toBulkActions } from '@/components/ui/RowActionMenu';
import { FloatingBulkBar } from '@/components/list-toolkit';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUpdateDogMutation, useDeleteDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { getDogDisplayName, type Dog, type DogStatus } from '@/types/dog-types';
import { dogActions } from '@/components/dogs/common/dogActions';
import { isBlockedByPaidOrScoredEntries } from '@/components/dogs/common/blockedDogDelete';

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
  /**
   * Reports the dogs the server refused over paid/scored entries, so the PAGE
   * can show them. This bar must not own that dialog: the optimistic delete
   * prunes the selection, the page unmounts this component, and a dialog owned
   * here would vanish before it rendered (MYK9-584).
   */
  onBlockedDogs?: (dogs: Dog[]) => void;
}

export function DogsBulkActionsBar({
  selectedDogs,
  onClear,
  canDelete = false,
  onBlockedDogs,
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

  // Nothing selected means nothing to act on. This is a plain early return
  // again: the blocked-delete dialog that once had to outlive the selection now
  // lives on the page (MYK9-584), so this component owns no state that must
  // survive its own unmount.
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
      {
        onFullSuccess: onClear,
        // Both halves or neither. Claiming strips the dog names and the reason
        // from the toast's detail lines because the page's dialog carries them —
        // so without a listener the user would get a bare count and no recourse.
        // The two options are wired together, never one-sided (MYK9-584).
        ...(onBlockedDogs
          ? {
              claimFailure: (_dog: Dog, error: unknown) => isBlockedByPaidOrScoredEntries(error),
              // Fires on retries too, so a retried failure that comes back
              // blocked still reaches the page rather than vanishing.
              onClaimedFailures: onBlockedDogs,
            }
          : {}),
      }
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
      <FloatingBulkBar count={count} noun={DOG_NOUN} onClear={onClear} busy={isBusy}>
        <RowActionMenu actions={actions} size="touch" label="Bulk actions" disabled={isBusy} />
      </FloatingBulkBar>

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
        warningText="Deleting these dogs also removes their show entries, cart items and waitlist spots. This action cannot be undone."
      />
    </>
  );
}

export default DogsBulkActionsBar;
