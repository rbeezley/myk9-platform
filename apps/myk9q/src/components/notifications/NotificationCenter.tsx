import React, { useState } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Inbox,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Dog,
  Megaphone,
  ExternalLink
} from 'lucide-react';
import './NotificationCenter.css';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isPanelOpen,
    closePanel,
    markAsRead,
    markAllAsRead,
    removeNotification
  } = useNotifications();

  // Two-dimensional filtering: type + read status
  const [typeFilter, setTypeFilter] = useState<'all' | 'announcements' | 'dogs'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Debug: Log notifications whenever they change
  React.useEffect(() => {}, [notifications, isPanelOpen]);

  const filteredNotifications = notifications.filter(n => {
    // Filter by read status
    if (showUnreadOnly && n.isRead) return false;

    // Filter by type
    if (typeFilter === 'announcements' && n.type !== 'announcement') return false;
    if (typeFilter === 'dogs' && n.type !== 'dog-alert') return false;

    return true;
  });

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    markAsRead(notification.id);
    if (notification.url) {
      navigate(notification.url);
      closePanel();
    }
  };

  const getIcon = (notification: typeof notifications[0]) => {
    if (notification.type === 'dog-alert') {
      return <Dog className="notif-icon dog-icon" />;
    }

    switch (notification.priority) {
      case 'urgent':
        return <AlertCircle className="notif-icon urgent-icon" />;
      case 'high':
        return <AlertTriangle className="notif-icon high-icon" />;
      default:
        return <Inbox className="notif-icon normal-icon" />;
    }
  };

  // Get the type icon for notification header (replaces emojis)
  const getTypeIcon = (notification: typeof notifications[0]) => {
    if (notification.type === 'dog-alert') {
      return <Dog size={16} className="notif-type-icon dog-type" />;
    }
    return <Megaphone size={16} className="notif-type-icon announcement-type" />;
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return time.toLocaleDateString();
  };

  if (!isPanelOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="notif-panel-backdrop"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Slide-out Panel */}
      <aside
        className="notif-panel"
        role="complementary"
        aria-label="Inbox"
      >
        {/* Header */}
        <div className="notif-panel-header">
          <div className="notif-panel-title">
            <Inbox size={24} />
            <h2>Inbox</h2>
            {unreadCount > 0 && (
              <span className="notif-unread-badge">{unreadCount}</span>
            )}
          </div>
          <button
            onClick={closePanel}
            className="notif-close-btn"
            aria-label="Close notification center"
          >
            <X size={24} />
          </button>
        </div>

        {/* Type Filter Tabs - Primary dimension */}
        <div className="notif-filter-tabs">
          <button
            onClick={() => setTypeFilter('all')}
            className={`notif-filter-tab ${typeFilter === 'all' ? 'active' : ''}`}
          >
            <Inbox size={14} />
            All ({notifications.length})
          </button>
          <button
            onClick={() => setTypeFilter('announcements')}
            className={`notif-filter-tab ${typeFilter === 'announcements' ? 'active' : ''}`}
          >
            <Megaphone size={14} />
            Announcements ({notifications.filter(n => n.type === 'announcement').length})
          </button>
          <button
            onClick={() => setTypeFilter('dogs')}
            className={`notif-filter-tab ${typeFilter === 'dogs' ? 'active' : ''}`}
          >
            <Dog size={14} />
            My Favorites ({notifications.filter(n => n.type === 'dog-alert').length})
          </button>
        </div>

        {/* Unread Filter Toggle - Secondary dimension */}
        <div className="notif-unread-toggle">
          <label className="notif-toggle-label">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
              className="notif-toggle-checkbox"
            />
            <span className="notif-toggle-text">
              Show only unread
              {unreadCount > 0 && <span className="notif-toggle-count">({unreadCount})</span>}
            </span>
          </label>
        </div>

        {/* Actions */}
        {notifications.length > 0 && unreadCount > 0 && (
          <div className="notif-panel-actions">
            <button onClick={markAllAsRead} className="notif-action-btn">
              <CheckCircle size={16} />
              Mark all read
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="notif-panel-content">
          {filteredNotifications.length === 0 ? (
            <div className="notif-empty-state">
              <Inbox className="notif-empty-icon" />
              <h3>
                {showUnreadOnly ? "You're all caught up!" : 'No notifications'}
              </h3>
              <p>
                {showUnreadOnly
                  ? 'All notifications have been read'
                  : typeFilter === 'announcements'
                    ? 'No announcements yet'
                    : typeFilter === 'dogs'
                      ? 'No alerts for your dogs yet'
                      : 'New notifications will appear here'}
              </p>
            </div>
          ) : (
            <div className="notif-list">
              {filteredNotifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notif-item ${!notification.isRead ? 'notif-item-unread' : ''} notif-item-${notification.priority}`}
                >
                  {/* Icon */}
                  <div className="notif-item-icon">
                    {getIcon(notification)}
                  </div>

                  {/* Content */}
                  <div
                    className="notif-item-content"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="notif-item-header">
                      {getTypeIcon(notification)}
                      <h4 className="notif-item-title">{notification.title}</h4>
                    </div>
                    <p className="notif-item-message">{notification.content}</p>
                    <div className="notif-item-meta">
                      <span className="notif-item-time">{formatTimeAgo(notification.timestamp)}</span>
                      {notification.showName && (
                        <>
                          <span className="notif-item-divider">•</span>
                          <span className="notif-item-show">{notification.showName}</span>
                        </>
                      )}
                      {notification.url && (
                        <>
                          <span className="notif-item-divider">•</span>
                          <ExternalLink size={12} className="notif-item-link-icon" />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="notif-item-actions">
                    {!notification.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="notif-item-action-btn"
                        title="Mark as read"
                        aria-label="Mark as read"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(notification.id);
                      }}
                      className="notif-item-action-btn"
                      title="Remove"
                      aria-label="Remove notification"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
