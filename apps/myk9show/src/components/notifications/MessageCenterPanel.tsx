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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNotificationStore, type AlertEntry } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useMessageStore } from '@/store/messageStore';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from './notification-styles';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { useMessageShowClassOptions } from '@/features/messages/hooks/useMessageShowClassOptions';
import type {
  MessageShowDeliveryLane,
  MessageShowRecipientType,
} from '@/features/show-workbench/messageShow';

type MessageCenterTab = 'notifications' | 'showMessages';

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
  const shows = useShowStore(s => s.shows);
  const [activeTab, setActiveTab] = useState<MessageCenterTab>('notifications');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeShowId, setComposeShowId] = useState<string>('');

  const isStaffDestination = isSecretary || isAdmin || hasRole('club_admin');
  const canPostShowWideMessage = author.isOfficial;
  const canSendTargetedShowMessages = isSecretary || isAdmin || hasRole('trial_secretary');
  const canComposeShowMessage = canPostShowWideMessage || canSendTargetedShowMessages;
  const composeAllowedRecipients: MessageShowRecipientType[] = canComposeShowMessage
    ? [
        'all_show',
        ...(canSendTargetedShowMessages ? (['class', 'checked_in'] as const) : []),
      ]
    : [];
  const composeShowWideDeliveryLane: MessageShowDeliveryLane = canPostShowWideMessage
    ? 'announcement'
    : 'targeted';
  const showsById = new Map(shows.map(show => [show.id, show]));
  const staffShows =
    currentShowIds.length > 0
      ? currentShowIds.map((showId, index) => {
          const show = showsById.get(showId);
          return {
            id: showId,
            name: show?.name ?? (currentShowIds.length === 1 ? 'Current show' : `Show ${index + 1}`),
          };
        })
      : shows.map(show => ({ id: show.id, name: show.name }));
  const selectedComposeShowId =
    composeShowId || (staffShows.length === 1 ? staffShows[0].id : '');
  const {
    data: composeClasses = [],
    isError: composeClassesError,
    refetch: retryComposeClasses,
  } = useMessageShowClassOptions(
    isComposeOpen && selectedComposeShowId ? selectedComposeShowId : null,
    { enabled: isComposeOpen && !!selectedComposeShowId }
  );
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

  function handleOpenCompose() {
    setComposeShowId(staffShows.length === 1 ? staffShows[0].id : '');
    setIsComposeOpen(true);
  }

  function handleOpenFullView() {
    closeCenter();
    navigate('/secretary/messages');
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

  function renderShowMessagesTab() {
    const filteredAnnouncements = unreadOnly
      ? announcements.filter(announcement => !announcement.is_read)
      : announcements;
    const visibleThreads = unreadOnly
      ? threads.filter(thread => (thread.unread_count ?? 0) > 0)
      : threads;
    const hasShowMessages = filteredAnnouncements.length > 0 || visibleThreads.length > 0;

    return (
      <div className="flex-1 overflow-y-auto">
        {messagesLoading && !hasShowMessages ? (
          <div className="p-6 text-sm text-muted-foreground">Loading messages...</div>
        ) : messagesError && !hasShowMessages ? (
          <div className="space-y-3 p-6">
            <p className="text-sm text-destructive">Couldn't load messages.</p>
            <Button variant="outline" size="sm" onClick={handleRetryMessages}>
              Try again
            </Button>
          </div>
        ) : !hasShowMessages ? (
          <EmptyPanelState
            icon={MessageSquare}
            title="No show messages yet"
            body={
              unreadOnly
                ? 'No unread show messages'
                : 'Show-wide updates and direct messages will appear here.'
            }
          />
        ) : (
          <>
            {messagesError && (
              <div className="flex items-center justify-between gap-3 border-b border-border/50 p-3">
                <p className="text-sm text-destructive">Couldn't load all messages.</p>
                <Button variant="outline" size="sm" onClick={handleRetryMessages}>
                  Try again
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
            {visibleThreads.map(thread => (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleThreadClick(thread.id, thread.show_id)}
                className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left hover:bg-muted/40"
              >
                <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {thread.show_name ?? 'Show message'}
                  </span>
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
            ))}
          </>
        )}
      </div>
    );
  }

  if (!isCenterOpen) return null;

  const unreadHeaderProps =
    totalUnread > 0
      ? {
          subtitle: `${totalUnread} unread`,
          headerActions: (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          ),
        }
      : {};

  return (
    <>
      <SlideOverPanel
        open={isCenterOpen}
        onClose={closeCenter}
        title="Message Center"
        side="right"
        size="sm"
        {...unreadHeaderProps}
      >
        {canComposeShowMessage && (
          <div className="flex gap-2 border-b border-border/50 p-3">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleOpenCompose}
              disabled={staffShows.length === 0}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Compose
            </Button>
            {isStaffDestination && (
              <Button variant="outline" size="sm" onClick={handleOpenFullView}>
                Open full view
              </Button>
            )}
          </div>
        )}
        <div className="flex border-b border-border/50 px-4" role="tablist">
          {[
            { key: 'notifications' as const, label: 'Notifications', icon: Bell },
            { key: 'showMessages' as const, label: 'Show messages', icon: MessageSquare },
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
        {activeTab === 'showMessages' && renderShowMessagesTab()}
      </SlideOverPanel>

      {isComposeOpen && (
        <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Compose show message</DialogTitle>
              <DialogDescription>
                Send a show message to everyone, a class, or checked-in exhibitors.
              </DialogDescription>
            </DialogHeader>

            {staffShows.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="message-center-compose-show">Show</Label>
                <Select value={composeShowId} onValueChange={setComposeShowId}>
                  <SelectTrigger id="message-center-compose-show">
                    <SelectValue placeholder="Select a show" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffShows.map(show => (
                      <SelectItem key={show.id} value={show.id}>
                        {show.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {staffShows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Select or load a managed show before composing.
              </p>
            )}

            {selectedComposeShowId && composeClassesError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-destructive">
                      Couldn't load classes for this show.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try again before sending a class message.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void retryComposeClasses()}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            ) : selectedComposeShowId ? (
              <MessageShowComposer
                showId={selectedComposeShowId}
                classes={composeClasses}
                allowedRecipients={composeAllowedRecipients}
                showWideDeliveryLane={composeShowWideDeliveryLane}
                showHistoryLink={false}
                onSent={() => setIsComposeOpen(false)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a show to continue.</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
