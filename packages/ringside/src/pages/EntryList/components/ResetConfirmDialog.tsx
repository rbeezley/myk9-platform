import React from 'react';
import { Entry } from '../../../stores/entryStore';
import { RingsideModal, modalButtonClass } from './RingsideModal';

export interface ResetConfirmDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** The entry to reset (null if dialog is closed) */
  entry: Entry | null;
  /** Handler for confirming the reset */
  onConfirm: () => void;
  /** Handler for cancelling */
  onCancel: () => void;
}

/**
 * Confirmation dialog for resetting an entry's score.
 * Used by both entry-list modes (single class and combined A/B).
 *
 * Previously authored against `ringside.css`, which #436 deleted without
 * migrating this component — so its `dialog-overlay` / `dialog-button` classes
 * had no CSS at all and this rendered as an unstyled inline block at the bottom
 * of the page. A judge confirming a destructive score reset could be reading a
 * prompt below the fold, with the page behind it still fully interactive.
 */
export const ResetConfirmDialog: React.FC<ResetConfirmDialogProps> = ({
  isOpen,
  entry,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !entry) {
    return null;
  }

  return (
    <RingsideModal
      title="Reset score"
      onDismiss={onCancel}
      footer={
        <>
          <button
            type="button"
            className={`${modalButtonClass} border border-border bg-background text-foreground hover:bg-muted`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="reset-dialog-confirm"
            className={`${modalButtonClass} bg-destructive text-destructive-foreground hover:bg-destructive/90`}
            onClick={onConfirm}
          >
            Reset score
          </button>
        </>
      }
    >
      <p>
        Reset the score for{' '}
        <strong className="text-foreground">
          {entry.callName} ({entry.armband})
        </strong>
        ?
      </p>
      <p>This removes their current score and moves them back to the pending list.</p>
    </RingsideModal>
  );
};

export default ResetConfirmDialog;
