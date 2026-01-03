import React, { useState, useEffect } from 'react';
import { useAnnouncementStore, type Announcement } from '../../stores/announcementStore';
import { AnnouncementService } from '../../services/announcementService';
import { logger } from '@/utils/logger';
import {
  validateAnnouncementForm,
  validateOnlineStatus,
  prepareAnnouncementData,
} from './createAnnouncementHelpers';
import {
  AccessDeniedModal,
  OfflineBanner,
  ModalHeader,
  PreviewContent,
  PrioritySelector,
  ModalFooter,
  ErrorMessage,
  FormHint
} from './createAnnouncementComponents';

interface CreateAnnouncementModalProps {
  licenseKey: string;
  userRole?: 'admin' | 'judge' | 'steward' | 'exhibitor';
  onClose: () => void;
  onSuccess: () => void;
  editingAnnouncement?: Announcement; // For future edit functionality
}

export const CreateAnnouncementModal: React.FC<CreateAnnouncementModalProps> = ({
  licenseKey,
  userRole = 'exhibitor',
  onClose,
  onSuccess,
  editingAnnouncement
}) => {
  const { createAnnouncement, updateAnnouncement } = useAnnouncementStore();

  // Form state
  const [title, setTitle] = useState(editingAnnouncement?.title || '');
  const [content, setContent] = useState(editingAnnouncement?.content || '');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>(
    editingAnnouncement?.priority || 'normal'
  );
  const [authorName, setAuthorName] = useState(editingAnnouncement?.author_name || '');
  const [expiresAt, setExpiresAt] = useState(
    editingAnnouncement?.expires_at ?
      new Date(editingAnnouncement.expires_at).toISOString().slice(0, 16) : ''
  );

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const isEditing = !!editingAnnouncement;
  const canCreate = AnnouncementService.canManageAnnouncements(userRole || '');

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!canCreate) {
    return <AccessDeniedModal onClose={onClose} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate form data
    const formValidation = validateAnnouncementForm({ title, content, priority, authorName, expiresAt });
    if (!formValidation.isValid) {
      setError(formValidation.error!);
      return;
    }

    // Check online status
    const onlineValidation = validateOnlineStatus();
    if (!onlineValidation.isValid) {
      setError(onlineValidation.error!);
      return;
    }

    setIsSubmitting(true);

    try {
      const announcementData = prepareAnnouncementData(
        { title, content, priority, authorName, expiresAt },
        userRole as 'admin' | 'judge' | 'steward',
        licenseKey
      );

      if (isEditing) {
        await updateAnnouncement(editingAnnouncement!.id, announcementData);
      } else {
        await createAnnouncement(announcementData);
      }

      onSuccess();
    } catch (err) {
      logger.error('Error saving announcement:', err);
      setError(err instanceof Error ? err.message : 'Failed to save announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleInfo = AnnouncementService.getRoleBadgeInfo(userRole! as 'admin' | 'judge' | 'steward');

  const formData = { title, content, priority, authorName, expiresAt };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-announcement-modal" onClick={(e) => e.stopPropagation()}>
        {/* Offline Warning Banner */}
        <OfflineBanner isOnline={isOnline} />

        {/* Header */}
        <ModalHeader
          isEditing={isEditing}
          roleInfo={roleInfo}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(!showPreview)}
          onClose={onClose}
        />

        {/* Content */}
        <div className="modal-body">
          {showPreview ? (
            <PreviewContent formData={formData} roleInfo={roleInfo} />
          ) : (
            <form onSubmit={handleSubmit} className="announcement-form">
              {/* Title */}
              <div className="form-group">
                <label htmlFor="title" className="form-label">
                  Title *
                  <span className="char-count">{title.length}/200</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter announcement title..."
                  className="form-input"
                  maxLength={200}
                  required
                />
              </div>

              {/* Content */}
              <div className="form-group">
                <label htmlFor="content" className="form-label">
                  Content *
                  <span className="char-count">{content.length}/2000</span>
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter announcement content..."
                  className="form-textarea"
                  rows={6}
                  maxLength={2000}
                  required
                />
              </div>

              {/* Priority */}
              <PrioritySelector priority={priority} onPriorityChange={setPriority} />

              {/* Author Name (Optional) */}
              <div className="form-group">
                <label htmlFor="authorName" className="form-label">
                  Your Name (Optional)
                </label>
                <input
                  id="authorName"
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="e.g. Judge Smith, Ring Steward..."
                  className="form-input"
                  maxLength={100}
                />
                <FormHint>This will be displayed with your role. Leave blank to show role only.</FormHint>
              </div>

              {/* Expiry Date (Optional) */}
              <div className="form-group">
                <label htmlFor="expiresAt" className="form-label">
                  Expires (Optional)
                </label>
                <input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="form-input"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <FormHint>Announcement will be hidden after this date/time.</FormHint>
              </div>

              {/* Error Message */}
              <ErrorMessage error={error} />
            </form>
          )}
        </div>

        {/* Footer */}
        <ModalFooter
          isSubmitting={isSubmitting}
          isOnline={isOnline}
          isEditing={isEditing}
          canSubmit={!!(title.trim() && content.trim())}
          onClose={onClose}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};