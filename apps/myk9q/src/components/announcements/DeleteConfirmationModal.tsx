import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import type { Announcement } from '../../stores/announcementStore';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  announcement: Announcement | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  announcement,
  onConfirm,
  onCancel,
  isDeleting = false
}) => {
  if (!isOpen || !announcement) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-container delete-confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon-container danger">
              <AlertTriangle className="modal-icon" />
            </div>
            <div className="modal-title-section">
              <h2>Delete Announcement</h2>
              <p className="modal-subtitle">This action cannot be undone</p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isDeleting}
          >
            <X />
          </button>
        </div>

        <div className="modal-body">
          <div className="delete-preview">
            <div className="announcement-preview">
              <div className="preview-header">
                <span className={`priority-badge ${announcement.priority}`}>
                  {announcement.priority.toUpperCase()}
                </span>
                <span className="author-info">
                  by {announcement.author_role.toUpperCase()}
                </span>
              </div>
              <h3 className="preview-title">{announcement.title}</h3>
              <p className="preview-content">
                {announcement.content.length > 100
                  ? `${announcement.content.substring(0, 100)}...`
                  : announcement.content
                }
              </p>
            </div>

            <div className="warning-message">
              <AlertTriangle className="warning-icon" />
              <span>This announcement will be permanently deleted and removed from all users' feeds.</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <Trash2 className="btn-icon" />
            {isDeleting ? 'Deleting...' : 'Delete Announcement'}
          </button>
        </div>
      </div>
    </div>
  );
};