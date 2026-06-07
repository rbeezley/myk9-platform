import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { useShowStore } from '@/store/showStore';
import { ThreadList } from '@/features/messages/components/ThreadList';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageInput } from '@/features/messages/components/MessageInput';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/common/EmptyState';
import { MessageSquare } from 'lucide-react';

const ALL_SHOWS = 'all';

export default function SecretaryMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showIdParam = searchParams.get('showId');
  const filterShowId = showIdParam ?? ALL_SHOWS;

  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const error = useMessageStore(s => s.error);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);
  const subscribeMessages = useMessageStore(s => s.subscribe);

  const shows = useShowStore(s => s.shows);

  // Widen the message subscription beyond what App-level useMessageSubscription
  // provides (which scopes to exhibitorShowIds ∪ selectedShowId). The
  // "All shows" filter promises threads from every managed show, so the
  // page must subscribe its own union. The store mutex skips duplicates so
  // re-subscribes on `shows` reference changes are safe.
  const allShowIdsKey = useMemo(
    () =>
      shows
        .map(s => s.id)
        .sort()
        .join(','),
    [shows]
  );
  useEffect(() => {
    if (!allShowIdsKey) return;
    subscribeMessages(allShowIdsKey.split(','));
  }, [allShowIdsKey, subscribeMessages]);

  const { sendMessage, isSending } = useMessageMutations();

  const selectedShowId = filterShowId === ALL_SHOWS ? null : filterShowId;

  const showNameMap = useMemo(() => Object.fromEntries(shows.map(s => [s.id, s.name])), [shows]);

  const visibleThreads = useMemo(
    () => (selectedShowId ? threads.filter(t => t.show_id === selectedShowId) : threads),
    [threads, selectedShowId]
  );

  // Treat the active thread as "selected" only while it remains in the visible
  // list. When the filter narrows the list (or the thread disappears), the
  // derivation falls back to null and the right-pane shows the empty state —
  // no need for a setState-in-effect to imperatively clear selection.
  const activeThread = activeThreadId
    ? (visibleThreads.find(t => t.id === activeThreadId) ?? null)
    : null;
  const effectiveActiveId = activeThread?.id ?? null;
  const activeMessages = effectiveActiveId ? messagesByThread[effectiveActiveId] || [] : [];

  useEffect(() => {
    if (effectiveActiveId) {
      fetchMessages(effectiveActiveId).then(() => {
        storeMarkThreadRead(effectiveActiveId);
      });
    }
  }, [effectiveActiveId, fetchMessages, storeMarkThreadRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  function handleFilterChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === ALL_SHOWS) params.delete('showId');
    else params.set('showId', next);
    setSearchParams(params, { replace: true });
  }

  const handleSend = async (body: string) => {
    if (!activeThread) return;
    await sendMessage(activeThread.id, activeThread.show_id, body);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Couldn't load messages.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading && threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div
        className={cn(
          'w-full md:w-80 border-r flex flex-col shrink-0',
          effectiveActiveId && 'hidden md:flex'
        )}
      >
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Communication History</h1>
        </div>
        <div className="border-b px-4 py-2">
          <label className="sr-only" htmlFor="messages-show-filter">
            Filter by show
          </label>
          <select
            id="messages-show-filter"
            value={filterShowId}
            onChange={e => handleFilterChange(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value={ALL_SHOWS}>All shows</option>
            {shows.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {visibleThreads.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">
              {selectedShowId
                ? `No messages in ${showNameMap[selectedShowId] ?? 'this show'} yet.`
                : 'No messages yet.'}
            </p>
            {selectedShowId && (
              <button
                type="button"
                onClick={() => handleFilterChange(ALL_SHOWS)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <ThreadList
            threads={visibleThreads}
            activeThreadId={effectiveActiveId}
            onSelectThread={setActiveThreadId}
          />
        )}
      </div>

      <div className={cn('flex-1 flex flex-col', !effectiveActiveId && 'hidden md:flex')}>
        {effectiveActiveId ? (
          <>
            <div className="md:hidden p-2 border-b">
              <Button variant="ghost" size="sm" onClick={() => setActiveThreadId(null)}>
                ← Back
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeMessages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwnMessage={msg.sender_id === user?.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <MessageInput onSend={handleSend} disabled={isSending} />
          </>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Select a conversation"
            description="Choose a conversation from the list to view messages"
            size="sm"
            className="h-full py-0 justify-center"
          />
        )}
      </div>

    </div>
  );
}
