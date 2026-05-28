import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Entry } from '../../../stores/entryStore';

export interface ResetMenuPopupProps {
  /** The entry ID that the menu is open for (null if closed) */
  activeEntryId: number | null;
  /** Menu position */
  position: { top: number; left: number } | null;
  /** All entries to find the active one */
  entries: Entry[];
  /** Handler for reset score action */
  onResetScore: (entry: Entry) => void;
  /** Handler for closing the menu */
  onClose: () => void;
}

/**
 * Reset menu popup that appears when clicking the 3-dot menu on scored entries.
 * Uses portal to render at document body level to avoid CSS transform issues.
 * Shared between EntryList and CombinedEntryList.
 */
export const ResetMenuPopup: React.FC<ResetMenuPopupProps> = ({
  activeEntryId,
  position,
  entries,
  onResetScore,
  onClose,
}) => {
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.reset-menu') && !target.closest('.reset-menu-button')) {
        onClose();
      }
    };

    if (activeEntryId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeEntryId, onClose]);

  if (activeEntryId === null || !position) {
    return null;
  }

  const entry = entries.find(e => e.id === activeEntryId);
  if (!entry) {
    return null;
  }

  return createPortal(
    <div
      className="reset-menu"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-100%)', // Extend menu LEFT from anchor point
        zIndex: 10000
      }}
    >
      <div className="reset-menu-content">
        <button
          className="reset-option"
          onClick={() => onResetScore(entry)}
        >
          🔄 Reset Score
        </button>
      </div>
    </div>,
    document.body
  );
};

export default ResetMenuPopup;
