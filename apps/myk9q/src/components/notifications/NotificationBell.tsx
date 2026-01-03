import React from 'react';
import { Inbox } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import './NotificationBell.css';

interface NotificationBellProps {
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const { unreadCount, togglePanel } = useNotifications();

  return (
    <button
      onClick={togglePanel}
      className={`notification-bell ${className}`}
      title={`Inbox ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      aria-label={`Open inbox ${unreadCount > 0 ? `- ${unreadCount} unread` : ''}`}
    >
      <Inbox size={20} />
      {unreadCount > 0 && (
        <span className="notification-bell-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
