import React from 'react';
import { CheckCircle } from 'lucide-react';

export interface FloatingDoneButtonProps {
  /** Whether the button is visible */
  isVisible: boolean;
  /** Handler for clicking done */
  onClick: () => void;
}

/**
 * Floating done button for exiting drag mode.
 * Shared between EntryList and CombinedEntryList.
 */
export const FloatingDoneButton: React.FC<FloatingDoneButtonProps> = ({
  isVisible,
  onClick,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <button
      className="floating-done-button"
      onClick={onClick}
      aria-label="Done reordering"
    >
      <CheckCircle size={20} />
      Done
    </button>
  );
};

export default FloatingDoneButton;
