import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatTime } from '@/utils/dateFormat';
import type { MessageThread } from '@/features/messages/types';

interface ThreadListItemProps {
  thread: MessageThread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadListItem({ thread, isActive, onClick }: ThreadListItemProps) {
  const time = formatTime(thread.last_message_at);

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'w-full text-left px-4 py-3 border-b transition-colors hover:bg-accent/50',
        isActive && 'bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{thread.participant_name ?? 'Unknown'}</span>
          {thread.participant_role && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
              {thread.participant_role}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(thread.unread_count ?? 0) > 0 && (
            <Badge
              variant="default"
              className="h-5 min-w-[20px] flex items-center justify-center text-[10px]"
            >
              {thread.unread_count}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
      </div>
      {thread.last_message_preview && (
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {thread.last_message_preview}
        </p>
      )}
    </button>
  );
}
