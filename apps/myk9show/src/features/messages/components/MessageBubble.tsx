import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Message } from '@/features/messages/types';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      data-own-message={isOwnMessage}
      className={cn(
        'flex flex-col max-w-[80%] gap-1',
        isOwnMessage ? 'ml-auto items-end' : 'items-start'
      )}
    >
      {!isOwnMessage && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{message.sender_name ?? 'Unknown'}</span>
          {message.sender_role && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {message.sender_role}
            </Badge>
          )}
        </div>
      )}
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm',
          isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {message.body}
      </div>
      {message.group_label && (
        <span className="text-[10px] text-muted-foreground italic">{message.group_label}</span>
      )}
      <span className="text-[10px] text-muted-foreground">{time}</span>
    </div>
  );
}
