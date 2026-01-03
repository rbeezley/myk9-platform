/**
 * Success Dialog Component
 *
 * Beautiful modal dialog for showing success messages
 */

import React from 'react';
import './ConfirmationDialog.css';

interface SuccessDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  details?: string[];
}

export const SuccessDialog: React.FC<SuccessDialogProps> = ({
  isOpen,
  title,
  message,
  onClose,
  details
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-container dialog-success" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-icon">🎉</div>
          <h3 className="dialog-title">{title}</h3>
        </div>

        <div className="dialog-content">
          <p className="dialog-message">{message}</p>

          {details && details.length > 0 && (
            <div className="dialog-details">
              <h4>Changes applied to:</h4>
              <ul>
                {details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="success-note">
            <strong>💡 Note:</strong> Changes are now live on the Run Order Display
          </div>
        </div>

        <div className="dialog-actions">
          <button
            onClick={onClose}
            className="dialog-btn dialog-btn-confirm dialog-btn-success"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};