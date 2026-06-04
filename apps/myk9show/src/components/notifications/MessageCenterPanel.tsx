import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  Inbox,
  Megaphone,
  MessageSquare,
  Plus,
  X,
} from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { useNotificationStore, type AlertEntry } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useMessageStore } from '@/store/messageStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from './notification-styles';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { getAnnouncementAuthor } from '@/types/announcement-types';

type MessageCenterTab = 'notifications' | 'announcements' | 'messages';

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
          {Array.isArray(payload.data?.conflicts) && (
            <div className="mt-1 space-y-0.5">
              {(payload.data.conflicts as Array<{ className: string; dogsAhead: number }>).map(
                (conflict, i) => (
                  <p key={i} className="text-[11px] font-medium text-amber-500">
                    Also {conflict.dogsAhead} dogs away in {conflict.className}
                  </p>
                )
              )}
            </div>
          )}
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
                type="button"
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

function EmptyPanelState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Inbox;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/60">{body}</p>
    </div>
  );
}

export function MessageCenterPanel() {
  const navigate = useNavigate();
  const isCenterOpen = useNotificationStore(s => s.isCenterOpen);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const notificationUnread = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const markRead = useNotificationStore(s => s.markRead);
  const dismissAlert = useNotificationStore(s => s.dismissAlert);

  const announcements = useAnnouncementStore(s => s.announcements);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const currentShowIds = useAnnouncementStore(s => s.currentShowIds);
  const annMarkRead = useAnnouncementStore(s => s.markRead);
  const annMarkAllRead = useAnnouncementStore(s => s.markAllRead);

  const threads = useMessageStore(s => s.threads);
  const messageUnread = useMessageStore(s => s.unreadCount);
  const messagesLoading = useMessageStore(s => s.isLoading);
  const messagesError = useMessageStore(s => s.error);
  const messageShowIds = useMessageStore(s => s.currentShowIds);
  const retryMessageSubscribe = useMessageStore(s => s.subscribe);
  const markThreadRead = useMessageStore(s => s.markThreadRead);

  const { user, userWithRoles, isSecretary, isAdmin, hasRole } = useAuthContext();
  const author = getAnnouncementAuthor(user, userWithRoles);
  const [activeTab, setActiveTab] = useState<MessageCenterTab>('notifications');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isStaffDestination = isSecretary || isAdmin || hasRole('club_admin');
  const totalUnread = notificationUnread + announcementUnread + messageUnread;

  function handleMarkAllRead() {
    markAllRead();
    if (author.id) {
      void annMarkAllRead(author.id);
    }
    for (const thread of threads) {
      if ((thread.unread_count ?? 0) > 0) {
        markThreadRead(thread.id);
      }
    }
  }

  function handleThreadClick(threadId: string, showId: string) {
    const thread = threads.find(candidate => candidate.id === threadId);
    if (thread && (thread.unread_count ?? 0) > 0) {
      markThreadRead(thread.id);
    }
    closeCenter();
    navigate(isStaffDestination ? `/secretary/messages?showId=${showId}` : `/messages/${showId}`);
  }

  function handleRetryMessages() {
    void retryMessageSubscribe(messageShowIds);
  }

  function renderNotificationsTab() {
    const filteredAlerts = unreadOnly ? recentAlerts.filter(alert => !alert.read) : recentAlerts;
    if (filteredAlerts.length === 0) {
      return (
        <EmptyPanelState
          icon={Inbox}
          title="No notifications yet"
          body={unreadOnly ? 'No unread notifications' : "You're all caught up"}
        />
      );
    }
    return (
      <div className="flex-1 overflow-y-auto">
        {filteredAlerts.map(entry => (
          <NotificationItem
            key={entry.payload.id}
            entry={entry}
            onView={id => {
              markRead(id);
              closeCenter();
            }}
            onDismiss={dismissAlert}
          />
        ))}
      </div>
    );
  }

  function renderAnnouncementsTab() {
    const filteredAnnouncements = unreadOnly
      ? announcements.filter(announcement => !announcement.is_read)
      : announcements;
    if (filteredAnnouncements.length === 0) {
      return (
        <EmptyPanelState
          icon={Megaphone}
          title="No announcements yet"
          body={unreadOnly ? 'No unread announcements' : "You're all caught up"}
        />
      );
    }
    return (
      <div className="flex-1 overflow-y-auto">
        {author.isOfficial && (
          <div className="border-b border-border/50 p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsCreateOpen(true)}
              disabled={currentShowIds.length === 0}
            >
              <Plus className="mr-1.5 h-3 w-3" />
              New Announcement
            </Button>
          </div>
        )}
        {filteredAnnouncements.map(announcement => (
          <AnnouncementItem
            key={announcement.id}
            announcement={announcement}
            onMarkRead={id => {
              if (author.id) void annMarkRead(id, author.id);
            }}
          />
        ))}
      </div>
    );
  }

  function renderMessagesTab() {
    const visibleThreads = unreadOnly
      ? threads.filter(thread => (thread.unread_count ?? 0) > 0)
      : threads;
    return (
      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading messages...</div>
        ) : messagesError ? (
          <div className="space-y-3 p-6">
            <p className="text-sm text-destructive">Couldn't load messages.</p>
            <Button variant="outline" size="sm" onClick={handleRetryMessages}>
              Try again
            </Button>
          </div>
        ) : visibleThreads.length === 0 ? (
          <EmptyPanelState
            icon={MessageSquare}
            title="No messages yet"
            body={
              unreadOnly
                ? 'No unread messages'
                : 'Conversations with show organizers will appear here.'
            }
          />
        ) : (
          visibleThreads.map(thread => (
            <button
              key={thread.id}
              type="button"
              onClick={() => handleThreadClick(thread.id, thread.show_id)}
              className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left hover:bg-muted/40"
            >
              <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{thread.show_name ?? 'Show message'}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {thread.last_message_preview ?? thread.participant_name ?? 'Open conversation'}
                </span>
              </span>
              {(thread.unread_count ?? 0) > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {thread.unread_count}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    );
  }

  if (!isCenterOpen) return null;

  return (
    <>
      <SlideOverPanel
        open={isCenterOpen}
        onClose={closeCenter}
        title="Message Center"
        subtitle={totalUnread > 0 ? `${totalUnread} unread` : undefined}
        side="left"
        size="sm"
        headerActions={
          totalUnread > 0 ? (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      >
        <div className="flex border-b border-border/50 px-4" role="tablist">
          {[
            { key: 'notifications' as const, label: 'Notifications', icon: Bell },
            { key: 'announcements' as const, label: 'Announcements', icon: Megaphone },
            { key: 'messages' as const, label: 'Messages', icon: MessageSquare },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium ${
                activeTab === tab.key
                  ? 'border-b-2 border-orange-500 text-orange-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={event => setUnreadOnly(event.target.checked)}
              aria-label="Unread only"
              className="h-3 w-3 rounded border-border"
            />
            Unread only
          </label>
        </div>
        {activeTab === 'notifications' && renderNotificationsTab()}
        {activeTab === 'announcements' && renderAnnouncementsTab()}
        {activeTab === 'messages' && renderMessagesTab()}
      </SlideOverPanel>

      {isCreateOpen && currentShowIds.length > 0 && (
        <CreateAnnouncementDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          showId={currentShowIds[0]}
          authorId={author.id}
          authorRole={author.role}
          authorName={author.name}
        />
      )}
    </>
  );
}
