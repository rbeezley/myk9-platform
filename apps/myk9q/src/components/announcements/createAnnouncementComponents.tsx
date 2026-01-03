/**
 * CreateAnnouncement Sub-Components
 *
 * Extracted from CreateAnnouncementModal.tsx to reduce complexity.
 * Contains preview, access denied, and form section components.
 */

import React from 'react';
import {
  X,
  Send,
  AlertTriangle,
  Calendar,
  Eye,
  EyeOff,
  Info,
  WifiOff
} from 'lucide-react';
import { PRIORITY_OPTIONS, getPriorityOption } from './createAnnouncementHelpers';

// ============================================================================
// Types
// ============================================================================

interface RoleInfo {
  icon: string;
  label: string;
}

interface FormData {
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
  authorName: string;
  expiresAt: string;
}

// ============================================================================
// Access Denied Modal
// ============================================================================

interface AccessDeniedModalProps {
  onClose: () => void;
}

export const AccessDeniedModal: React.FC<AccessDeniedModalProps> = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="error-content">
          <AlertTriangle className="error-icon" />
          <h3>Access Denied</h3>
          <p>You don't have permission to create announcements.</p>
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Offline Warning Banner
// ============================================================================

interface OfflineBannerProps {
  isOnline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline }) => {
  if (isOnline) return null;

  return (
    <div className="offline-warning-banner" style={{
      background: 'var(--status-error)',
      color: 'white',
      padding: 'var(--token-space-xl)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--token-space-md)',
      borderRadius: 'var(--token-radius-md) var(--token-radius-md) 0 0'
    }}>
      <WifiOff size={20} />
      <span style={{ fontWeight: 500 }}>You're offline. Connect to the internet to create or update announcements.</span>
    </div>
  );
};

// ============================================================================
// Modal Header
// ============================================================================

interface ModalHeaderProps {
  isEditing: boolean;
  roleInfo: RoleInfo;
  showPreview: boolean;
  onTogglePreview: () => void;
  onClose: () => void;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  isEditing,
  roleInfo,
  showPreview,
  onTogglePreview,
  onClose
}) => {
  return (
    <div className="modal-header">
      <div className="header-left">
        <h2>{isEditing ? 'Edit Announcement' : 'Create Announcement'}</h2>
        <div className="author-badge">
          <span className="role-icon">{roleInfo.icon}</span>
          <span className="role-label">Posting as {roleInfo.label}</span>
        </div>
      </div>
      <div className="header-right">
        <button
          onClick={onTogglePreview}
          className={`preview-btn ${showPreview ? 'active' : ''}`}
          title={showPreview ? 'Hide preview' : 'Show preview'}
        >
          {showPreview ? <EyeOff /> : <Eye />}
        </button>
        <button onClick={onClose} className="close-btn">
          <X />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Preview Content
// ============================================================================

interface PreviewContentProps {
  formData: FormData;
  roleInfo: RoleInfo;
}

export const PreviewContent: React.FC<PreviewContentProps> = ({ formData, roleInfo }) => {
  const { title, content, priority, authorName, expiresAt } = formData;
  const priorityOption = getPriorityOption(priority);

  return (
    <div className="preview-content">
      <div className="preview-header">
        <h3>Preview</h3>
        <div className={`priority-badge ${priority}`}>
          {priorityOption?.icon}
          {priorityOption?.label}
        </div>
      </div>
      <div className="preview-announcement">
        <h4 className="preview-title">{title || 'Untitled Announcement'}</h4>
        <div className="preview-content-text">
          {content || 'No content yet...'}
        </div>
        <div className="preview-footer">
          <div className="preview-author">
            <span className="role-icon">{roleInfo.icon}</span>
            <span>{roleInfo.label}</span>
            {authorName && <span>{authorName}</span>}
          </div>
          {expiresAt && (
            <div className="preview-expiry">
              <Calendar className="calendar-icon" />
              <span>Expires {new Date(expiresAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Form Section - Priority Selector
// ============================================================================

interface PrioritySelectorProps {
  priority: 'normal' | 'high' | 'urgent';
  onPriorityChange: (priority: 'normal' | 'high' | 'urgent') => void;
}

export const PrioritySelector: React.FC<PrioritySelectorProps> = ({ priority, onPriorityChange }) => {
  return (
    <div className="form-group">
      <label className="form-label">Priority *</label>
      <div className="priority-selector">
        {PRIORITY_OPTIONS.map(option => (
          <label key={option.value} className="priority-option">
            <input
              type="radio"
              name="priority"
              value={option.value}
              checked={priority === option.value}
              onChange={(e) => onPriorityChange(e.target.value as 'normal' | 'high' | 'urgent')}
            />
            <div className={`priority-card ${option.value} ${priority === option.value ? 'selected' : ''}`}>
              <div className="priority-header">
                <span className="priority-icon">{option.icon}</span>
                <span className="priority-label">{option.label}</span>
              </div>
              <div className="priority-description">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Modal Footer
// ============================================================================

interface ModalFooterProps {
  isSubmitting: boolean;
  isOnline: boolean;
  isEditing: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  isSubmitting,
  isOnline,
  isEditing,
  canSubmit,
  onClose,
  onSubmit
}) => {
  const renderButtonContent = () => {
    if (isSubmitting) {
      return (
        <>
          <div className="spinner" />
          {isEditing ? 'Updating...' : 'Creating...'}
        </>
      );
    }
    if (!isOnline) {
      return (
        <>
          <WifiOff />
          Offline
        </>
      );
    }
    return (
      <>
        <Send />
        {isEditing ? 'Update' : 'Create'} Announcement
      </>
    );
  };

  return (
    <div className="modal-footer">
      <button
        type="button"
        onClick={onClose}
        className="btn btn-secondary"
        disabled={isSubmitting}
      >
        Cancel
      </button>
      <button
        type="submit"
        onClick={onSubmit}
        className="btn btn-primary"
        disabled={isSubmitting || !canSubmit || !isOnline}
        title={!isOnline ? 'Cannot create announcements while offline' : ''}
      >
        {renderButtonContent()}
      </button>
    </div>
  );
};

// ============================================================================
// Error Message
// ============================================================================

interface ErrorMessageProps {
  error: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  if (!error) return null;

  return (
    <div className="error-message">
      <AlertTriangle className="error-icon" />
      <span>{error}</span>
    </div>
  );
};

// ============================================================================
// Form Hint
// ============================================================================

interface FormHintProps {
  children: string;
}

export const FormHint: React.FC<FormHintProps> = ({ children }) => {
  return (
    <div className="form-hint">
      <Info className="info-icon" />
      <span>{children}</span>
    </div>
  );
};
