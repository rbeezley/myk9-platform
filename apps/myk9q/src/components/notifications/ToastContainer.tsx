import React from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { ToastNotification } from './ToastNotification';
import { cn } from '@/lib/utils';

/** Tailwind styles for ToastContainer */
const styles = {
  container: cn(
    "fixed top-20 right-4 z-[9999]",
    "flex flex-col gap-3 pointer-events-none",
    "md:top-[70px]",
    "max-md:left-4 max-md:items-stretch",
    "[&>*]:pointer-events-auto"
  ),
};

export const ToastContainer: React.FC = () => {
  const { notifications, markAsRead } = useNotifications();

  // Only show the 3 most recent unread notifications as toasts
  const toastsToShow = notifications
    .filter(n => !n.isRead)
    .slice(0, 3);

  if (toastsToShow.length === 0) {
    return null;
  }

  // When toast dismisses, just mark as read (keep in notification center)
  const handleToastDismiss = (id: string) => {
markAsRead(id);
  };

  return (
    <div className={styles.container} role="region" aria-label="Notifications">
      {toastsToShow.map(notification => (
        <ToastNotification
          key={notification.id}
          notification={notification}
          onDismiss={handleToastDismiss}
          onMarkAsRead={markAsRead}
        />
      ))}
    </div>
  );
};
