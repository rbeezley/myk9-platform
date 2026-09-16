import { useState } from 'react';
import { DeleteConfirmationDialog } from '@/components/base';
import { ForceDeleteOverride } from '@/components/dogs/common/ForceDeleteOverride';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

/**
 * Why these dogs are in the dialog.
 *
 * `blocked` — the server refused them over paid/scored entries (MK002).
 * `override-failed` — an admin override was attempted on them and did NOT
 *   succeed (permission revoked mid-session, RLS, network). Reusing the
 *   `blocked` copy here made the app blame the entries for a permission
 *   failure, which is simply false (MYK9-584 review).
 */
export type BlockedDogsReason = 'blocked' | 'override-failed';

interface BlockedDogDeleteDialogProps {
  /** Dogs to report. Empty closes the dialog. */
  dogs: Dog[];
  /** What put them here. Drives the copy — see BlockedDogsReason. */
  reason?: BlockedDogsReason;
  open: boolean;
  onClose: () => void;
  /** Runs force_delete_dog across `dogs`. */
  onForceDelete: () => void | Promise<void>;
  isSubmitting?: boolean;
  /**
   * Whether the viewer may override. When false the dialog is purely
   * informational — it names the blocked dogs and offers only Close, which is
   * still far better than a toast that vanishes before they are read.
   */
  canForceDelete?: boolean;
}

/**
 * What a bulk delete does with the dogs the server refused.
 *
 * INTENT: a bulk delete only learns which dogs are blocked AFTER attempting
 * them, so this used to surface as a partial-failure toast — a list of names
 * and reasons that disappears in a few seconds and cannot be re-opened. That is
 * the wrong container for a list the user has to act on. This dialog is
 * persistent, names every blocked dog, and puts the resolution in reach.
 * Do not regress this back into a toast.
 */
export function BlockedDogDeleteDialog({
  dogs,
  reason = 'blocked',
  open,
  onClose,
  onForceDelete,
  isSubmitting = false,
  canForceDelete = false,
}: BlockedDogDeleteDialogProps) {
  // Re-armed by MOUNTING: the bulk bar renders this only while there are
  // blocked dogs, so a new batch always starts unacknowledged. Resetting via an
  // effect instead would be a setState-in-effect cascade.
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);

  const count = dogs.length;
  const noun = count === 1 ? 'dog' : 'dogs';

  return (
    <DeleteConfirmationDialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      onConfirm={onForceDelete}
      title={`${count} ${noun} could not be deleted`}
      description={
        reason === 'override-failed'
          ? 'The override did not go through. This is not about their entries — check the message for the reason, and confirm you still have site-admin access.'
          : 'These dogs have paid or scored entries, so the server refused to delete them.'
      }
      entityName={`${count} ${noun}`}
      entityType="Dog"
      confirmLabel="Delete anyway"
      cancelLabel="Close"
      confirmDisabled={!canForceDelete || !overrideAcknowledged}
      isDeleting={isSubmitting}
      warningText={
        <>
          <span className="block">
            {reason === 'override-failed'
              ? 'Nothing was deleted. You can try the override again, or close and investigate.'
              : `Scratch or refund their entries to delete them normally${
                  canForceDelete ? ', or override below' : ''
                }.`}
          </span>
          <ul className="mt-2 list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
            {dogs.map(dog => (
              <li key={dog.id} className="text-foreground">
                {getDogDisplayName(dog)}
              </li>
            ))}
          </ul>
        </>
      }
      additionalContent={
        canForceDelete ? (
          <ForceDeleteOverride
            id="bulk-force-delete-override"
            checked={overrideAcknowledged}
            onCheckedChange={setOverrideAcknowledged}
            disabled={isSubmitting}
          />
        ) : undefined
      }
    />
  );
}

export default BlockedDogDeleteDialog;
