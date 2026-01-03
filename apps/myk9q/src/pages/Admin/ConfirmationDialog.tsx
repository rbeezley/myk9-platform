/**
 * Custom Confirmation Dialog Component
 *
 * Beautiful modal dialog for confirming admin actions
 */

import React from 'react';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  type?: 'success' | 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  details?: string[];
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  type = 'warning',
  onConfirm,
  onCancel,
  details
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'danger':
        return '🚨';
      case 'warning':
      default:
        return '⚠️';
    }
  };

  const getTypeClass = () => {
    switch (type) {
      case 'success':
        return 'dialog-success';
      case 'danger':
        return 'dialog-danger';
      case 'warning':
      default:
        return 'dialog-warning';
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className={`dialog-container ${getTypeClass()}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-icon">{getIcon()}</div>
          <h3 className="dialog-title">{title}</h3>
        </div>

        <div className="dialog-content">
          <p className="dialog-message">{message}</p>

          {details && details.length > 0 && (
            <div className="dialog-details">
              <h4>Classes affected:</h4>
              <ul>
                {details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            onClick={onCancel}
            className="dialog-btn dialog-btn-cancel"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`dialog-btn dialog-btn-confirm dialog-btn-${type}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};