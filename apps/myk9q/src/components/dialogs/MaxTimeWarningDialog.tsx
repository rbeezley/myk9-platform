import React from 'react';
import { AlertTriangle, Clock, X } from 'lucide-react';
import './shared-dialog.css';
import './MaxTimeWarningDialog.css';

interface MaxTimeWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSetMaxTime: () => void;
  onContinueAnyway: () => void;
  classData: {
    element: string;
    level: string;
    class_name: string;
  };
}

export const MaxTimeWarningDialog: React.FC<MaxTimeWarningDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  onContinueAnyway,
  classData
}) => {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-container max-time-warning-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header warning-header">
          <div className="dialog-title">
            <AlertTriangle className="title-icon warning-icon" />
            <span>Max Time Not Set</span>
          </div>
          <button className="close-button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="dialog-content">
          <div className="warning-content">
            <div className="warning-icon-large">
              <Clock className="h-12 w-12" />
            </div>

            <div className="warning-message">
              <h3>Max time has not been set for this class</h3>
              <p className="class-info">
                <strong>{classData.element} {classData.level}</strong>
              </p>
              <p className="warning-text">
                Judges typically need to set max times before starting to score entries.
                This ensures consistent timing for all competitors.
              </p>
            </div>
          </div>

          <div className="warning-actions">
            <button
              className="action-button primary-action"
              onClick={onSetMaxTime}
            >
              <Clock className="button-icon" />
              Set Max Time Now
            </button>

            <button
              className="action-button secondary-action"
              onClick={onContinueAnyway}
            >
              Continue Anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};