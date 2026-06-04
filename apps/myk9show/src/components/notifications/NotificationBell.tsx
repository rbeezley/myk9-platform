import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useMessageStore } from '@/store/messageStore';

export function NotificationBell() {
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const openCenter = useNotificationStore(s => s.openCenter);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const messageUnread = useMessageStore(s => s.unreadCount);

  const totalUnread = unreadCount + announcementUnread + messageUnread;

  return (
    <button
      aria-label="Message Center"
      onClick={openCenter}
      className="relative rounded-md p-2 hover:bg-muted"
    >
      <Bell className="h-5 w-5" />
      {totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  );
}
