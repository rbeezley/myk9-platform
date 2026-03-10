import { Megaphone, AlertCircle, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import type { ShowAnnouncement, AnnouncementPriority } from '@/types/announcement-types';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from '@/components/notifications/notification-styles';

const PRIORITY_ICON: Record<AnnouncementPriority, { icon: typeof Megaphone; className: string }> = {
  urgent: { icon: AlertCircle, className: 'bg-red-500/15 text-red-400' },
  high: { icon: AlertTriangle, className: 'bg-amber-500/15 text-amber-400' },
  normal: { icon: Megaphone, className: 'bg-purple-500/15 text-purple-400' },
};

const ROLE_LABELS: Record<string, string> = {
  secretary: 'Secretary',
  judge: 'Judge',
  club_admin: 'Club Admin',
};

interface AnnouncementItemProps {
  announcement: ShowAnnouncement;
  onMarkRead?: (id: string) => void;
  onEdit?: (announcement: ShowAnnouncement) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

export function AnnouncementItem({
  announcement,
  onMarkRead,
  onEdit,
  onDelete,
  showActions = false,
}: AnnouncementItemProps) {
  const { icon: Icon, className: iconClass } = PRIORITY_ICON[announcement.priority];

  const handleClick = () => {
    if (!announcement.is_read && onMarkRead) {
      onMarkRead(announcement.id);
    }
  };

  return (
    <div
      className={`border-b border-border/50 border-l-[3px] p-3.5 transition-opacity ${
        PRIORITY_BORDER[announcement.priority]
      } ${announcement.is_read ? 'opacity-50' : 'bg-muted/5'}`}
      onClick={handleClick}
      role="article"
      aria-label={announcement.title}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">{announcement.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{announcement.content}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <span>{announcement.author_name ?? 'Unknown'}</span>
            <span>&middot;</span>
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
              {ROLE_LABELS[announcement.author_role] ?? announcement.author_role}
            </span>
            <span>&middot;</span>
            <span>{formatRelativeTime(new Date(announcement.created_at))}</span>
          </div>
        </div>
        {showActions && (onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit(announcement);
                }}
                aria-label="Edit announcement"
                className="rounded p-1 text-muted-foreground/40 hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDelete(announcement.id);
                }}
                aria-label="Delete announcement"
                className="rounded p-1 text-muted-foreground/40 hover:bg-muted hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
