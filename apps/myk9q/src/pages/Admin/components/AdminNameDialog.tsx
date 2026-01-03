/**
 * AdminNameDialog Component
 *
 * Prompts administrator to enter their name for audit trail purposes.
 * Used before critical actions like releasing results or changing check-in settings.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import React from 'react';
import { User } from 'lucide-react';

/**
 * Props for AdminNameDialog component
 */
export interface AdminNameDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current admin name value */
  tempAdminName: string;
  /** Handler for admin name changes */
  onAdminNameChange: (name: string) => void;
  /** Handler for confirming and continuing with the action */
  onConfirm: () => void;
  /** Handler for canceling the dialog */
  onCancel: () => void;
}

/**
 * AdminNameDialog Component
 *
 * A modal dialog that prompts the administrator to enter their name
 * for audit trail purposes before performing critical actions.
 *
 * **Features:**
 * - Auto-focus on input field
 * - Enter key to submit
 * - Disabled submit button when name is empty
 * - Click outside to cancel
 * - Accessibility: labeled input, keyboard navigation
 *
 * **Use Cases:**
 * - Before releasing competition results
 * - Before enabling/disabling check-in
 * - Before any action requiring admin identification
 *
 * @example
 * ```tsx
 * <AdminNameDialog
 *   isOpen={adminNameDialog.isOpen}
 *   tempAdminName={tempAdminName}
 *   onAdminNameChange={setTempAdminName}
 *   onConfirm={handleAdminNameConfirm}
 *   onCancel={() => setAdminNameDialog({ isOpen: false, pendingAction: null })}
 * />
 * ```
 */
export function AdminNameDialog({
  isOpen,
  tempAdminName,
  onAdminNameChange,
  onConfirm,
  onCancel
}: AdminNameDialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-container dialog-warning" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-icon">
            <User className="dialog-icon-svg" />
          </div>
          <h3 className="dialog-title">Administrator Name Required</h3>
        </div>

        <div className="dialog-content">
          <p className="dialog-message">
            Please enter your name for the audit trail. This helps track who made changes to the competition settings.
          </p>

          <div className="admin-name-input-group">
            <label htmlFor="tempAdminName" className="admin-name-label">
              Your Name:
            </label>
            <input
              id="tempAdminName"
              type="text"
              value={tempAdminName}
              onChange={(e) => onAdminNameChange(e.target.value)}
              placeholder="Enter your name"
              className="admin-name-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tempAdminName.trim()) {
                  onConfirm();
                }
              }}
            />
          </div>
        </div>

        <div className="dialog-actions">
          <button
            className="dialog-btn dialog-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-confirm dialog-btn-primary"
            onClick={onConfirm}
            disabled={!tempAdminName.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
