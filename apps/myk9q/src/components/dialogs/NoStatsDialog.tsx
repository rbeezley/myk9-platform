/**
 * NoStatsDialog
 *
 * A lightweight popup shown when a user clicks Statistics for a class with no scored entries.
 * Better UX than navigating to a full page just to show "no statistics".
 */

import React from 'react';
import { BarChart3, X } from 'lucide-react';
import './NoEntriesDialog.css'; // Reuse same styling

interface NoStatsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string; // The class name to display
}

export const NoStatsDialog: React.FC<NoStatsDialogProps> = ({
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
        aria-labelledby="no-stats-title"
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

        {/* Icon */}
        <div className="no-entries-dialog-icon">
          <BarChart3 size={40} />
        </div>

        {/* Title */}
        <h2 id="no-stats-title" className="no-entries-dialog-title">
          No Statistics Available
        </h2>

        {/* Class name as subtitle */}
        {className && (
          <p className="no-entries-dialog-class-name">{className}</p>
        )}

        {/* Message */}
        <p className="no-entries-dialog-message">
          This class doesn't have any scored entries yet.
          Statistics will be available once entries have been scored.
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
