/**
 * NoEntriesDialog
 *
 * A lightweight popup shown when a user clicks on a class that has no entries.
 * Better UX than navigating to a full page just to show "no entries".
 */

import React from 'react';
import { Users, X } from 'lucide-react';
import './NoEntriesDialog.css';

interface NoEntriesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string; // The class name to display
}

export const NoEntriesDialog: React.FC<NoEntriesDialogProps> = ({
  isOpen,
  onClose,
  className,
}) => {
  if (!isOpen) return null;

  return (
    <div className="no-entries-dialog-overlay" onClick={onClose}>
      <div
        className="no-entries-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-entries-title"
      >
        {/* Close button */}
        <button
          type="button"
          className="no-entries-dialog-close"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Icon - simple, no gradient background */}
        <div className="no-entries-dialog-icon">
          <Users size={40} />
        </div>

        {/* Title with proper wrapping */}
        <h2 id="no-entries-title" className="no-entries-dialog-title">
          No Entries Yet
        </h2>

        {/* Class name as subtitle */}
        {className && (
          <p className="no-entries-dialog-class-name">{className}</p>
        )}

        {/* Message */}
        <p className="no-entries-dialog-message">
          This class doesn't have any entries yet.
          Entries will appear once they are registered.
        </p>

        {/* Single dismiss button */}
        <div className="no-entries-dialog-actions">
          <button type="button" className="no-entries-dialog-btn" onClick={onClose}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
