import React, { useState } from 'react';
import { useAnnouncementStore } from '../../stores/announcementStore';
import { AnnouncementService } from '../../services/announcementService';
import type { Announcement } from '../../stores/announcementStore';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye
} from 'lucide-react';

interface AnnouncementCardProps {
  announcement: Announcement;
  currentUserRole?: 'admin' | 'judge' | 'steward' | 'exhibitor';
  onEdit?: () => void;
  onDelete?: () => void;
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({
  announcement,
  currentUserRole = 'exhibitor',
  onEdit,
  onDelete
}) => {
  const { markAsRead } = useAnnouncementStore();
  const [showActions, setShowActions] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const priorityInfo = AnnouncementService.getPriorityBadgeInfo(announcement.priority);
  const roleInfo = AnnouncementService.getRoleBadgeInfo(announcement.author_role);
  const timeAgo = AnnouncementService.formatTimeAgo(announcement.created_at);
  const isExpired = AnnouncementService.isExpired(announcement);

  // Check if user can edit/delete this announcement
  const canEdit = AnnouncementService.canEditAnnouncement(currentUserRole, announcement.author_role);
  const showActionsMenu = canEdit && (onEdit || onDelete);

  // Handle marking as read when card is clicked
  const handleCardClick = () => {
    if (!announcement.is_read) {
      markAsRead(announcement.id);
    }
    setIsExpanded(!isExpanded);
  };

  // Handle action button clicks (prevent propagation to card click)
  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setShowActions(false);
  };

  // Determine if content should be truncated
  const isLongContent = announcement.content.length > 200;
  const shouldTruncate = isLongContent && !isExpanded;

  return (
    <div
      className={`announcement-card ${announcement.is_read ? 'read' : 'unread'} ${announcement.priority}`}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="card-header">
        <div className="header-left">
          {/* Priority Badge */}
          <div className={`priority-badge ${announcement.priority}`}>
            <span className="priority-icon">{priorityInfo.icon}</span>
            <span className="priority-label">{priorityInfo.label}</span>
          </div>

          {/* Expiry Warning */}
          {isExpired && (
            <div className="expired-badge">
              <AlertTriangle className="expired-icon" />
              <span>EXPIRED</span>
            </div>
          )}
        </div>

        <div className="header-right">
          {/* Read Status Indicator */}
          {announcement.is_read ? (
            <CheckCircle className="read-icon" />
          ) : (
            <div className="unread-indicator" />
          )}

          {/* Actions Menu */}
          {showActionsMenu && (
            <div className="actions-container">
              <button
                className="actions-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
              >
                <MoreHorizontal />
              </button>

              {showActions && (
                <div className="actions-menu">
                  {onEdit && (
                    <button
                      className="action-item edit"
                      onClick={(e) => handleActionClick(e, onEdit)}
                    >
                      <Edit />
                      <span>Edit</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="action-item delete"
                      onClick={(e) => handleActionClick(e, onDelete)}
                    >
                      <Trash2 />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="card-title">
        <h3>{announcement.title}</h3>
      </div>

      {/* Content */}
      <div className="card-content">
        <div className={`content-text ${shouldTruncate ? 'truncated' : ''}`}>
          {shouldTruncate
            ? announcement.content.substring(0, 200) + '...'
            : announcement.content
          }
        </div>

        {/* Expand/Collapse Button for long content */}
        {isLongContent && (
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="card-footer">
        <div className="footer-left">
          {/* Author Info */}
          <div className="author-info">
            <div className={`role-badge ${announcement.author_role}`}>
              <span className="role-icon">{roleInfo.icon}</span>
              <span className="role-label">{roleInfo.label}</span>
            </div>
            {announcement.author_name && (
              <span className="author-name">{announcement.author_name}</span>
            )}
          </div>
        </div>

        <div className="footer-right">
          {/* Timestamp */}
          <div className="timestamp">
            <Clock className="clock-icon" />
            <span className="time-ago">{timeAgo}</span>
          </div>
        </div>
      </div>

      {/* Expiry Date */}
      {announcement.expires_at && (
        <div className="expiry-info">
          <AlertTriangle className="expiry-icon" />
          <span className="expiry-text">
            {isExpired ? 'Expired' : 'Expires'} {AnnouncementService.formatTimeAgo(announcement.expires_at)}
          </span>
        </div>
      )}

      {/* Click Overlay */}
      {!announcement.is_read && (
        <div className="click-overlay">
          <Eye className="eye-icon" />
          <span>Click to mark as read</span>
        </div>
      )}
    </div>
  );
};