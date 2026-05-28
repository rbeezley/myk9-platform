import React from 'react';

export interface SelfCheckinDisabledDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Handler for closing the dialog */
  onClose: () => void;
}

/**
 * Dialog shown when a user tries to check in but self check-in is disabled.
 * Shared between EntryList and CombinedEntryList.
 */
export const SelfCheckinDisabledDialog: React.FC<SelfCheckinDisabledDialogProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="reset-dialog-overlay">
      <div className="reset-dialog">
        <h3>🚫 Self Check-in Disabled</h3>
        <p>
          Self check-in has been disabled for this class by the administrator.
        </p>
        <p className="reset-dialog-warning">
          Please check in at the central table or contact the ring steward for assistance.
        </p>
        <div className="reset-dialog-buttons">
          <button
            className="reset-dialog-confirm self-checkin-ok-button"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelfCheckinDisabledDialog;
