import React, { useEffect, useState } from 'react';
import { X, Bell, AlertTriangle, AlertCircle, Dog, Megaphone, Eye } from 'lucide-react';
import type { InAppNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import './ToastNotification.css';

interface ToastNotificationProps {
  notification: InAppNotification;
  onDismiss: (id: string) => void;
  onMarkAsRead: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  notification,
  onDismiss,
  onMarkAsRead
}) => {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300); // Match CSS animation duration
  };

  // Auto-dismiss non-urgent notifications after 8 seconds
  useEffect(() => {
    if (notification.priority !== 'urgent') {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [notification.priority, handleDismiss]);

  const handleView = () => {
    onMarkAsRead(notification.id);
    if (notification.url) {
      navigate(notification.url);
    }
    handleDismiss();
  };

  // Get icon based on notification type and priority
  const getIcon = () => {
    if (notification.type === 'dog-alert') {
      return <Dog className="toast-icon dog-icon" />;
    }

    switch (notification.priority) {
      case 'urgent':
        return <AlertCircle className="toast-icon urgent-icon" />;
      case 'high':
        return <AlertTriangle className="toast-icon high-icon" />;
      default:
        return <Bell className="toast-icon normal-icon" />;
    }
  };

  // Get type indicator icon (replaces emojis)
  const getTypeIcon = () => {
    if (notification.type === 'dog-alert') {
      return <Dog size={16} className="toast-type-icon dog-type" />;
    }
    return <Megaphone size={16} className="toast-type-icon announcement-type" />;
  };

  return (
    <div
      className={`toast-notification toast-${notification.priority} ${isExiting ? 'toast-exit' : ''} ${!notification.isRead ? 'toast-unread' : ''}`}
      role="alert"
      aria-live={notification.priority === 'urgent' ? 'assertive' : 'polite'}
    >
      {/* Icon */}
      <div className="toast-icon-container">
        {getIcon()}
      </div>

      {/* Content */}
      <div className="toast-content">
        <div className="toast-header">
          {getTypeIcon()}
          <h4 className="toast-title">{notification.title}</h4>
          {notification.priority === 'urgent' && (
            <span className="toast-priority-badge">URGENT</span>
          )}
        </div>
        <p className="toast-message">{notification.content}</p>
        {notification.showName && (
          <span className="toast-show-name">{notification.showName}</span>
        )}
      </div>

      {/* Actions */}
      <div className="toast-actions">
        {notification.url && (
          <button
            onClick={handleView}
            className="toast-action-btn toast-view-btn"
            title="View"
          >
            <Eye size={14} />
            <span>View</span>
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="toast-action-btn toast-dismiss-btn"
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar for auto-dismiss */}
      {notification.priority !== 'urgent' && (
        <div className="toast-progress-bar" />
      )}
    </div>
  );
};
