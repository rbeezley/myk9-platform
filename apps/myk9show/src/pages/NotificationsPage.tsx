import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useDbNotifications,
  useMarkAllNotificationsRead,
  type DbNotification,
  type DbNotificationType,
} from '@/hooks/useDbNotifications';
import { formatRelativeTime } from '@/lib/timeUtils';

const TYPE_CONFIG: Record<DbNotificationType, { label: string; chipBg: string; chipFg: string }> = {
  entry_confirmed: {
    label: 'Entry',
    chipBg: 'var(--chip-teal-bg)',
    chipFg: 'var(--chip-teal-fg)',
  },
  q_earned: {
    label: 'Q',
    chipBg: 'var(--chip-green-bg)',
    chipFg: 'var(--chip-green-fg)',
  },
  schedule_change: {
    label: 'Schedule',
    chipBg: 'var(--chip-amber-bg)',
    chipFg: 'var(--chip-amber-fg)',
  },
  judge_assignment: {
    label: 'Judge',
    chipBg: 'var(--chip-blue-bg)',
    chipFg: 'var(--chip-blue-fg)',
  },
};

function NotificationChip({ type }: { type: DbNotificationType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: cfg.chipBg, color: cfg.chipFg }}
    >
      {cfg.label}
    </span>
  );
}

function NotificationRow({ n }: { n: DbNotification }) {
  const isRead = !!n.read_at;
  return (
    <div
      className={`flex items-start gap-3 border-b border-border/50 px-4 py-3 transition-opacity last:border-b-0 ${isRead ? 'opacity-60' : ''}`}
    >
      <div className="pt-0.5">
        <NotificationChip type={n.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isRead ? 'text-muted-foreground' : 'font-medium'}`}>{n.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">
          {formatRelativeTime(new Date(n.created_at))}
        </p>
      </div>
      {n.deep_link_url && (
        <Link
          to={n.deep_link_url}
          className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-foreground"
          aria-label="Go to details"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useDbNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = useMemo(() => notifications.filter(n => !n.read_at).length, [notifications]);

  const grouped = useMemo(() => {
    const map = new Map<string, DbNotification[]>();
    for (const n of notifications) {
      const day = new Date(n.created_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(n);
    }
    return map;
  }, [notifications]);

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Entry confirmations, Qs earned, and schedule updates will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            {[...grouped.entries()].map(([day, items]) => (
              <div key={day}>
                <div className="border-b border-border/50 bg-muted/30 px-4 py-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {day}
                  </p>
                </div>
                {items.map(n => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
