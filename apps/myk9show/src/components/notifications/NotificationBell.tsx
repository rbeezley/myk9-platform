import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, Megaphone } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { formatRelativeTime } from '@/lib/timeUtils';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.id ?? '';
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const openCenter = useNotificationStore(s => s.openCenter);
  const announcements = useAnnouncementStore(s => s.announcements);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const annMarkAllRead = useAnnouncementStore(s => s.markAllRead);

  const totalUnread = unreadCount + announcementUnread;

  // Merge alerts + announcements sorted by timestamp, newest first, capped at 5
  const previewItems = useMemo(() => {
    const alertItems = recentAlerts.map(a => ({
      id: a.payload.id,
      title: a.payload.title,
      body: a.payload.body,
      timestamp: a.payload.timestamp,
      read: a.read,
      isAnnouncement: false,
    }));
    const announcementItems = announcements.map(a => ({
      id: a.id,
      title: a.title,
      body: a.content,
      timestamp: new Date(a.created_at).getTime(),
      read: a.is_read,
      isAnnouncement: true,
    }));
    return [...alertItems, ...announcementItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [recentAlerts, announcements]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleViewAll = () => {
    setIsOpen(false);
    openCenter();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        aria-label="Notifications"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-md p-2 hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold">Notifications</span>
            {previewItems.length > 0 && (
              <button
                onClick={handleViewAll}
                className="text-xs font-medium text-orange-500 hover:text-orange-400"
              >
                View all
              </button>
            )}
          </div>
          {previewItems.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No notifications</div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto divide-y">
                {previewItems.map(item => (
                  <div key={item.id} className={`p-3 ${item.read ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      {item.isAnnouncement && (
                        <Megaphone className="h-3 w-3 shrink-0 text-purple-400" />
                      )}
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground">{item.body}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(new Date(item.timestamp))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex border-t">
                <button
                  onClick={() => {
                    markAllRead();
                    annMarkAllRead(userId);
                  }}
                  className="flex-1 p-2 text-center text-sm text-muted-foreground hover:bg-muted"
                >
                  Mark all read
                </button>
                <button
                  onClick={handleViewAll}
                  className="flex-1 p-2 text-center text-sm font-medium text-orange-500 hover:bg-muted border-l border-border"
                >
                  View all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
