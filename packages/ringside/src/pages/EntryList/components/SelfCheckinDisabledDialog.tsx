import React from 'react';
import { RingsideModal, modalButtonClass } from './RingsideModal';

export interface SelfCheckinDisabledDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Handler for closing the dialog */
  onClose: () => void;
}

/**
 * Dialog shown when a user tries to check in but self check-in is disabled.
 * Used by both entry-list modes (single class and combined A/B).
 *
 * Same history as ResetConfirmDialog: authored against `ringside.css`, which
 * #436 deleted without migrating this component, so its `reset-dialog-overlay`
 * classes had no CSS and this rendered unstyled and unscrimmed. This dialog is
 * the ONLY explanation an exhibitor gets for a status pill that refuses to
 * change, so rendering it somewhere they might not see it defeated its purpose.
 */
export const SelfCheckinDisabledDialog: React.FC<SelfCheckinDisabledDialogProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <RingsideModal
      title="Self check-in is off for this class"
      onDismiss={onClose}
      footer={
        <button
          type="button"
          data-testid="self-checkin-ok-button"
          className={`${modalButtonClass} bg-primary text-primary-foreground hover:bg-primary/90`}
          onClick={onClose}
        >
          OK
        </button>
      }
    >
      <p>Check in at the central table, or ask the ring steward for help.</p>
    </RingsideModal>
  );
};

export default SelfCheckinDisabledDialog;
