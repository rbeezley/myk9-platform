import { MessageSquare } from 'lucide-react';
import { ThreadListItem } from './ThreadListItem';
import { EmptyState } from '@/components/common/EmptyState';
import type { MessageThread } from '@/features/messages/types';

interface ThreadListProps {
  threads: MessageThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export function ThreadList({ threads, activeThreadId, onSelectThread }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        size="sm"
        className="h-full py-0 justify-center"
      />
    );
  }

  return (
    <div className="overflow-y-auto">
      {threads.map(thread => (
        <ThreadListItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onClick={() => onSelectThread(thread.id)}
        />
      ))}
    </div>
  );
}
