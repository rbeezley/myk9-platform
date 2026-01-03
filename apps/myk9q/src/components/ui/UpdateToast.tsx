import { RefreshCw } from 'lucide-react';
import './UpdateToast.css';

interface UpdateToastProps {
  /** Called when user taps "Update Now" */
  onUpdate: () => void;
  /** Called when user taps "Later" */
  onLater: () => void;
}

/**
 * PWA Update Toast
 *
 * Displays a styled notification when a new app version is available.
 * Replaces the browser's native confirm() dialog with a branded experience.
 *
 * Features:
 * - Fixed position at bottom of screen
 * - Teal accent to match app branding
 * - "Update Now" and "Later" buttons
 * - Accessible with proper ARIA attributes
 */
export function UpdateToast({ onUpdate, onLater }: UpdateToastProps) {
  return (
    <div
      className="update-toast-overlay"
      role="alertdialog"
      aria-labelledby="update-toast-message"
      aria-describedby="update-toast-message"
    >
      <div className="update-toast">
        <div className="update-toast-icon">
          <RefreshCw size={24} />
        </div>

        <div className="update-toast-content">
          <p id="update-toast-message" className="update-toast-message">
            myK9Q has been updated! Tap to load new features.
          </p>
        </div>

        <div className="update-toast-actions">
          <button
            className="update-toast-btn update-toast-btn-primary"
            onClick={onUpdate}
          >
            Update Now
          </button>
          <button
            className="update-toast-btn update-toast-btn-secondary"
            onClick={onLater}
            autoFocus
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdateToast;
