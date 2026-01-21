import React from 'react';
import { Inbox } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { cn } from '@/lib/utils';

/** Tailwind styles for NotificationBell */
const styles = {
  button: cn(
    "relative flex items-center justify-center",
    "w-10 h-10 rounded-lg",
    "bg-transparent border-none cursor-pointer",
    "text-inherit transition-all duration-200",
    "hover:bg-black/5 dark:hover:bg-white/10",
    "active:scale-95"
  ),
  badge: cn(
    "absolute top-1 right-1",
    "flex items-center justify-center",
    "min-w-[18px] h-[18px] px-1.5",
    "bg-red-600 text-white rounded-full",
    "text-[11px] font-bold leading-none",
    "shadow-sm",
    "animate-pulse"
  ),
};

interface NotificationBellProps {
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const { unreadCount, togglePanel } = useNotifications();

  return (
    <button
      onClick={togglePanel}
      className={cn(styles.button, className)}
      title={`Inbox ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      aria-label={`Open inbox ${unreadCount > 0 ? `- ${unreadCount} unread` : ''}`}
    >
      <Inbox size={20} />
      {unreadCount > 0 && (
        <span className={styles.badge}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
