import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Dog, Megaphone, AlertCircle, AlertTriangle, Inbox, Plus } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import type { AlertEntry } from '@/store/notificationStore';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from './notification-styles';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { ANNOUNCEMENT_OFFICIAL_ROLES } from '@/types/announcement-types';
import type { AnnouncementAuthorRole } from '@/types/announcement-types';

type FilterTab = 'all' | 'dogs' | 'announcements';

const DOG_TYPES = [
  'your_turn',
  'check_in_reminder',
  'results_posted',
  'class_starting',
] as const satisfies readonly NotificationType[];

function PriorityIcon({
  priority,
  type,
}: {
  priority: NotificationPriority;
  type: NotificationType;
}) {
  if (type === 'announcement') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
        <Megaphone className="h-4 w-4 text-purple-400" />
      </div>
    );
  }
  if (priority === 'urgent') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/15">
        <AlertCircle className="h-4 w-4 text-red-400" />
      </div>
    );
  }
  if (priority === 'high') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
      <Inbox className="h-4 w-4 text-blue-400" />
    </div>
  );
}

function NotificationItem({
  entry,
  onView,
  onDismiss,
}: {
  entry: AlertEntry;
  onView: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { payload, read } = entry;

  return (
    <div
      className={`border-b border-border/50 border-l-[3px] p-3.5 transition-opacity ${PRIORITY_BORDER[payload.priority]} ${
        read ? 'opacity-50' : 'bg-muted/5'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <PriorityIcon priority={payload.priority} type={payload.type} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">{payload.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{payload.body}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeTime(new Date(payload.timestamp))}
            </span>
            <div className="flex items-center gap-2">
              {!read && payload.actionUrl && (
                <a
                  href={payload.actionUrl}
                  onClick={() => onView(payload.id)}
                  className="rounded bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-500 hover:text-orange-400"
                >
                  View &rarr;
                </a>
              )}
              <button
                onClick={() => onDismiss(payload.id)}
                aria-label={`Dismiss notification ${payload.id}`}
                className="rounded p-0.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const isCenterOpen = useNotificationStore(s => s.isCenterOpen);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const markRead = useNotificationStore(s => s.markRead);
  const dismissAlert = useNotificationStore(s => s.dismissAlert);
  const panelRef = useRef<HTMLDivElement>(null);

  const storeAnnouncements = useAnnouncementStore(s => s.announcements);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const currentShowIds = useAnnouncementStore(s => s.currentShowIds);
  const annMarkRead = useAnnouncementStore(s => s.markRead);
  const annMarkAllRead = useAnnouncementStore(s => s.markAllRead);
  const { userWithRoles } = useAuthContext();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const userRole = (userWithRoles?.roles ?? []).find(r =>
    (ANNOUNCEMENT_OFFICIAL_ROLES as readonly string[]).includes(r)
  );
  const isOfficial = !!userRole;
  const authorRole: AnnouncementAuthorRole = (userRole as AnnouncementAuthorRole) ?? 'secretary';
  const authorId = userWithRoles?.id ?? '';
  const authorName =
    (userWithRoles?.user_metadata?.full_name as string | undefined) ??
    userWithRoles?.email ??
    'Unknown';

  const totalUnread = unreadCount + announcementUnread;

  // Body scroll lock
  useEffect(() => {
    if (!isCenterOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCenterOpen]);

  // Close on Escape + focus trap
  useEffect(() => {
    if (!isCenterOpen) return;

    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeCenter();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCenterOpen, closeCenter]);

  const filteredAlerts = useMemo(() => {
    let filtered = recentAlerts;

    if (activeTab === 'dogs') {
      filtered = filtered.filter(a => (DOG_TYPES as readonly string[]).includes(a.payload.type));
    } else if (activeTab === 'announcements') {
      filtered = []; // Announcements come from announcementStore, rendered separately
    }

    if (unreadOnly) {
      filtered = filtered.filter(a => !a.read);
    }

    return filtered;
  }, [recentAlerts, activeTab, unreadOnly]);

  const filteredAnnouncements = useMemo(() => {
    if (activeTab === 'dogs') return [];
    let filtered = storeAnnouncements;
    if (unreadOnly) {
      filtered = filtered.filter(a => !a.is_read);
    }
    return filtered;
  }, [storeAnnouncements, activeTab, unreadOnly]);

  const handleView = (id: string) => {
    markRead(id);
    closeCenter();
  };

  const handleMarkAllRead = () => {
    markAllRead();
    if (authorId) {
      void annMarkAllRead(authorId);
    }
  };

  if (!isCenterOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="notification-backdrop"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={closeCenter}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border/50 bg-popover shadow-2xl animate-in slide-in-from-right duration-300 outline-none sm:w-[400px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-4">
          <div>
            <h2 className="text-base font-semibold">Notifications</h2>
            {totalUnread > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{totalUnread} unread</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-orange-500 hover:text-orange-400"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={closeCenter}
              aria-label="Close notifications"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center border-b border-border/50 px-4" role="tablist">
          {[
            { key: 'all' as const, label: 'All' },
            { key: 'dogs' as const, label: 'Dogs', icon: Dog },
            {
              key: 'announcements' as const,
              label: 'Announcements',
              icon: Megaphone,
            },
          ].map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-label={tab.label}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-orange-500 text-orange-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon && <tab.icon className="h-3 w-3" />}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => setUnreadOnly(e.target.checked)}
              aria-label="Unread only"
              className="h-3 w-3 rounded border-border"
            />
            Unread only
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredAlerts.length === 0 && filteredAnnouncements.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Inbox className="mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {unreadOnly ? 'No unread notifications' : "You're all caught up"}
              </p>
            </div>
          ) : (
            <>
              {/* Officials see "+ New" on Announcements tab */}
              {activeTab === 'announcements' && isOfficial && (
                <div className="border-b border-border/50 p-2">
                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/50 py-2 text-xs font-medium text-muted-foreground hover:border-border hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    New Announcement
                  </button>
                </div>
              )}
              {filteredAnnouncements.map(ann => (
                <AnnouncementItem
                  key={`ann-${ann.id}`}
                  announcement={ann}
                  onMarkRead={id => {
                    if (authorId) void annMarkRead(id, authorId);
                  }}
                />
              ))}
              {filteredAlerts.map(entry => (
                <NotificationItem
                  key={entry.payload.id}
                  entry={entry}
                  onView={handleView}
                  onDismiss={dismissAlert}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {isCreateOpen && userWithRoles && (
        <CreateAnnouncementDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          showId={currentShowIds[0] ?? ''}
          authorId={authorId}
          authorRole={authorRole}
          authorName={authorName}
        />
      )}
    </>
  );
}
