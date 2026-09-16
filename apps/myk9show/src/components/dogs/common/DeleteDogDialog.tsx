import React, { useState } from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { Dog } from '@/types/dog-types';
import {
  blockingCountErrorText,
  blockingCountPendingText,
  buildImpactSuffix,
  buildWarningText,
  deleteDogSubtitle,
} from './deleteDogDialogCopy';
import { ForceDeleteOverride } from './ForceDeleteOverride';
import { NOT_BLOCKED, type BlockingEntryCountState } from './blockingEntryCount';

interface DeleteDogDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void | Promise<void>;
  dog: Dog | null;
  isSubmitting?: boolean;
  /**
   * Live entry count for the dog. When > 0 the dialog warns that deleting the
   * dog will also remove its entries, since soft_delete_dog cascades the delete
   * to entries (see migration 20260616130000). Pass undefined while loading.
   */
  activeEntryCount?: number | undefined;
  /**
   * Whether the current user can restore a deleted dog (admin-only restore UI).
   * Drives the warning copy: admins get the restore note, everyone else gets
   * "This action cannot be undone." Defaults to false (the safe, honest message).
   */
  canRestore?: boolean;
  /**
   * Live entries that make the server refuse the delete (paid or scored), as a
   * three-state value — see `blockingEntryCount.ts`. An unknown count must not
   * read as zero and enable a delete the server will reject, so `pending` and
   * `error` both hold the destructive button closed and say why. Defaults to
   * `{ status: 'ready', count: 0 }`: a caller that does not track blocking
   * entries is asserting "not blocked", which is not the same as not knowing.
   */
  blockingEntryCount?: BlockingEntryCountState;
  /**
   * Re-runs the blocking count. Required for the `error` state to be
   * recoverable — without it the dialog can only be cancelled.
   */
  onRetryBlockingCount?: (() => void) | undefined;
  /**
   * Whether the current user may override the refusal above (platform admin).
   * When true AND the delete is blocked, the dialog offers an explicit opt-in
   * that routes to `onForceDelete` instead of `onDelete`. The real gate is
   * `is_platform_admin()` inside `force_delete_dog`; this only decides whether
   * to show the affordance.
   */
  canForceDelete?: boolean;
  /** Runs the admin override (`force_delete_dog`). Required when `canForceDelete`. */
  onForceDelete?: (() => void | Promise<void>) | undefined;
}

const DeleteDogDialog: React.FC<DeleteDogDialogProps> = ({
  open,
  onClose,
  onDelete,
  dog,
  isSubmitting,
  activeEntryCount,
  canRestore = false,
  blockingEntryCount = NOT_BLOCKED,
  onRetryBlockingCount,
  canForceDelete = false,
  onForceDelete,
}) => {
  const isKnown = blockingEntryCount.status === 'ready';
  // MYK9-600: three states, three behaviours. `isBlocked` is a KNOWN refusal —
  // the only thing an admin override applies to. `isUnknown` is its own reason
  // to hold the button, and it must never borrow the override affordance: that
  // would invite a force delete on a dog that may have nothing wrong with it.
  const isBlocked = blockingEntryCount.status === 'ready' && blockingEntryCount.count > 0;
  const isUnknown = !isKnown;
  const canOverride = isBlocked && canForceDelete && !!onForceDelete;
  // The opt-in re-arms by MOUNTING, not by an effect that resets it on close:
  // callers render this dialog only while it is open, so a fresh open gets a
  // fresh `false`. A checkbox that stayed ticked from a previous dog would turn
  // the next delete into one click on a dialog the user has not read.
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);

  const warningText =
    blockingEntryCount.status === 'pending'
      ? blockingCountPendingText
      : blockingEntryCount.status === 'error'
        ? blockingCountErrorText
        : buildWarningText(activeEntryCount, canRestore, blockingEntryCount.count, canForceDelete);

  const retryControl =
    blockingEntryCount.status === 'error' && onRetryBlockingCount ? (
      // Full-size, not `sm`: this is the only route back to a usable Delete, and
      // docs/INTENT.md keeps the 44px floor for any control that is the sole way
      // to reach a primary or destructive action.
      //
      // `loading` is not decoration here: `isError` stays true for the whole
      // retry, so without it the button sits live and motionless through the
      // round trip and the only available reading is "my click did nothing"
      // (MYK9-600 round-2 review). Button's `loading` disables it, shows the
      // spinner and keeps the accessible name.
      <Button
        type="button"
        variant="outline"
        loading={blockingEntryCount.isRetrying}
        onClick={onRetryBlockingCount}
      >
        {!blockingEntryCount.isRetrying && <RefreshCw className="w-4 h-4 mr-2" />}
        Try again
      </Button>
    ) : undefined;

  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onClose}
      onConfirm={canOverride && overrideAcknowledged ? onForceDelete : onDelete}
      entityName={dog?.callName || 'this dog'}
      entityType="Dog"
      description={deleteDogSubtitle}
      impactSuffix={buildImpactSuffix(activeEntryCount)}
      warningText={warningText}
      confirmLabel={canOverride && overrideAcknowledged ? 'Delete anyway' : 'Delete'}
      confirmDisabled={isUnknown || (isBlocked && !(canOverride && overrideAcknowledged))}
      isDeleting={isSubmitting}
      additionalContent={
        canOverride ? (
          <ForceDeleteOverride
            checked={overrideAcknowledged}
            onCheckedChange={setOverrideAcknowledged}
            disabled={isSubmitting ?? false}
          />
        ) : (
          retryControl
        )
      }
    />
  );
};

export { DeleteDogDialog };
export default DeleteDogDialog;
