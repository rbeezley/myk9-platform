import React, { useState } from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import type { Dog } from '@/types/dog-types';
import { buildImpactSuffix, buildWarningText, deleteDogSubtitle } from './deleteDogDialogCopy';
import { ForceDeleteOverride } from './ForceDeleteOverride';

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
   * Live entries that make the server refuse the delete (paid or scored). When
   * > 0 the dialog explains the refusal and blocks Delete. Pass undefined while
   * loading — an unknown count must not read as zero and enable a delete the
   * server will reject.
   */
  blockingEntryCount?: number | undefined;
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
  blockingEntryCount,
  canForceDelete = false,
  onForceDelete,
}) => {
  const isBlocked = (blockingEntryCount ?? 0) > 0;
  const canOverride = isBlocked && canForceDelete && !!onForceDelete;
  // The opt-in re-arms by MOUNTING, not by an effect that resets it on close:
  // callers render this dialog only while it is open, so a fresh open gets a
  // fresh `false`. A checkbox that stayed ticked from a previous dog would turn
  // the next delete into one click on a dialog the user has not read.
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);

  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={onClose}
      onConfirm={canOverride && overrideAcknowledged ? onForceDelete : onDelete}
      entityName={dog?.callName || 'this dog'}
      entityType="Dog"
      description={deleteDogSubtitle}
      impactSuffix={buildImpactSuffix(activeEntryCount)}
      warningText={buildWarningText(activeEntryCount, canRestore, blockingEntryCount)}
      confirmLabel={canOverride && overrideAcknowledged ? 'Delete anyway' : 'Delete'}
      confirmDisabled={isBlocked && !(canOverride && overrideAcknowledged)}
      isDeleting={isSubmitting}
      additionalContent={
        canOverride ? (
          <ForceDeleteOverride
            checked={overrideAcknowledged}
            onCheckedChange={setOverrideAcknowledged}
            disabled={isSubmitting ?? false}
          />
        ) : undefined
      }
    />
  );
};

export { DeleteDogDialog };
export default DeleteDogDialog;
