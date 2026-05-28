import React from 'react';
import { Entry } from '../../../stores/entryStore';

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
 * Shared between EntryList and CombinedEntryList.
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
    <div className="dialog-overlay">
      <div className="dialog-container reset-dialog-container">
        <div className="dialog-header">
          <h3 className="dialog-title">Reset Score</h3>
        </div>
        <div className="dialog-content">
          <p>
            Are you sure you want to reset the score for <strong>{entry.callName}</strong> ({entry.armband})?
          </p>
          <p className="reset-dialog-warning">
            This will remove their current score and move them back to the pending list.
          </p>
        </div>
        <div className="dialog-footer">
          <button
            className="dialog-button dialog-button-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dialog-button dialog-button-primary reset-dialog-confirm"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetConfirmDialog;
