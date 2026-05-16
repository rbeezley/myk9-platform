import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { useMessageStore } from '@/store/messageStore';
import { ThreadDetail } from '@/features/messages/components/ThreadDetail';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MessageThread } from '@/features/messages/types';
import { FilterChips } from './FilterChips';

// Reserve vertical space while messages load so deferred content doesn't
// push the page down. ~280px matches a typical loaded list with a few rows.
// INTENT: prevent CLS on /secretary/dashboard.
export const MESSAGES_TAB_RESERVED_MIN_HEIGHT_PX = 280;

interface Show {
  id: string;
  name: string;
}

interface MessagesTabProps {
  shows: Show[];
}

type Filter = 'all' | string;

export function MessagesTab({ shows }: MessagesTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);

  const threads = useMessageStore(s => s.threads);
  const isLoading = useMessageStore(s => s.isLoading);

  const showNameMap = Object.fromEntries(shows.map(s => [s.id, s.name]));

  const filterOptions = ['all', ...shows.map(s => s.id)].map(v => ({
    value: v,
    label: v === 'all' ? 'All Shows' : (showNameMap[v] ?? v),
  }));

  const filtered = (filter === 'all' ? threads : threads.filter(t => t.show_id === filter))
    .slice()
    .sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

  const activeShowName = selectedThread
    ? (showNameMap[selectedThread.show_id] ?? selectedThread.show_id)
    : '';

  if (isLoading) {
    return (
      <div
        data-testid="messages-tab-skeleton"
        className="space-y-4"
        style={{ minHeight: `${MESSAGES_TAB_RESERVED_MIN_HEIGHT_PX}px` }}
        aria-busy="true"
        aria-label="Loading messages"
      >
        <Skeleton className="h-8 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterChips options={filterOptions} active={filter} onChange={setFilter} />

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <MessageSquare className="h-8 w-8 opacity-40" />
          <p className="text-sm">No messages yet.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map(thread => {
            const showName = showNameMap[thread.show_id] ?? thread.show_id;
            const hasUnread = (thread.unread_count ?? 0) > 0;

            return (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={cn(
                  'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg',
                  hasUnread && 'bg-primary/5'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('text-sm font-medium truncate', hasUnread && 'font-semibold')}
                      >
                        {thread.participant_name ?? 'Unknown'}
                      </span>
                      {hasUnread && (
                        <Badge variant="default" className="shrink-0 h-5 text-xs px-1.5">
                          {thread.unread_count}
                        </Badge>
                      )}
                    </div>
                    {thread.last_message_preview && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {thread.last_message_preview}
                      </p>
                    )}
                    <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 h-4">
                      {showName}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {thread.last_message_at
                      ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })
                      : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Thread slide-over */}
      <Sheet
        open={selectedThread !== null}
        onOpenChange={open => {
          if (!open) setSelectedThread(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>
              {selectedThread?.participant_name ?? 'Message thread'} — {activeShowName}
            </SheetTitle>
          </SheetHeader>
          {selectedThread && (
            <ThreadDetail thread={{ ...selectedThread, show_name: activeShowName }} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
