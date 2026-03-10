import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { formatRelativeTime } from '@/lib/timeUtils';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        aria-label="Notifications"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-md p-2 hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="p-3 font-semibold border-b">Notifications</div>
          {recentAlerts.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No notifications</div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto divide-y">
                {recentAlerts.map(({ payload, read }) => (
                  <div key={payload.id} className={`p-3 ${read ? 'opacity-60' : ''}`}>
                    <div className="font-medium text-sm">{payload.title}</div>
                    <div className="text-xs text-muted-foreground">{payload.body}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(new Date(payload.timestamp))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => markAllRead()}
                className="w-full p-2 text-center text-sm text-muted-foreground hover:bg-muted border-t"
              >
                Mark all read
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
