import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthContext } from '@/hooks/useAuthContext';
import { selectMessageShows } from '@/features/messages/messageShowScope';
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
import { ScheduledLifecycleEmailsPanel } from '@/features/lifecycle-emails';
import { EmailDeliveryHistory } from '@/features/email-delivery-history';
import { ListFilterBar, ListViewTabs } from '@/components/list-toolkit';
import type { ListFilterField, ListView } from '@/components/list-toolkit';

const ALL_SHOWS = 'all';

export default function SecretaryMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showIdParam = searchParams.get('showId');
  const sectionParam = searchParams.get('section');
  const threadIdParam = searchParams.get('threadId');
  const isEmailView = searchParams.get('view') === 'email';
  const filterShowId = showIdParam ?? ALL_SHOWS;

  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const error = useMessageStore(s => s.error);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);
  const subscribeMessages = useMessageStore(s => s.subscribe);

  const allLoadedShows = useShowStore(s => s.shows);
  const { userWithRoles, hasRole } = useAuthContext();

  // F24: the store holds every show the app has loaded, including other clubs'
  // shows pulled in for public browsing. Using it directly listed those clubs'
  // show NAMES in the filter and subscribed to their threads. Message content was
  // never exposed -- `threads_select` scopes reads to the show's club, proven by
  // supabase/tests/show_message_tenant_isolation_test.sql -- but the page should
  // not advertise shows it cannot read, nor ask the server for them.
  const shows = useMemo(
    () => selectMessageShows(allLoadedShows, userWithRoles, hasRole),
    [allLoadedShows, userWithRoles, hasRole]
  );

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

  const visibleThreads = useMemo(() => {
    let result = selectedShowId ? threads.filter(t => t.show_id === selectedShowId) : threads;
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter(
        t =>
          (t.participant_name ?? '').toLowerCase().includes(q) ||
          (t.last_message_preview ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [threads, selectedShowId, searchTerm]);

  const hasActiveFilters = Boolean(selectedShowId) || searchTerm.trim() !== '';

  // Treat the active thread as "selected" only while it remains in the visible
  // list. When the filter narrows the list (or the thread disappears), the
  // derivation falls back to null and the right-pane shows the empty state —
  // no need for a setState-in-effect to imperatively clear selection.
  const activeThread =
    !isEmailView && threadIdParam
      ? (visibleThreads.find(t => t.id === threadIdParam) ?? null)
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
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [activeMessages.length]);

  useEffect(() => {
    if (sectionParam !== 'scheduled') return;
    const section = document.getElementById('scheduled-emails');
    section?.scrollIntoView({ block: 'start' });
  }, [sectionParam, selectedShowId]);

  function handleFilterChange(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === ALL_SHOWS) params.delete('showId');
    else params.set('showId', next);
    params.delete('threadId');
    setSearchParams(params, { replace: true });
  }

  function handleSelectThread(threadId: string | null) {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (threadId) next.set('threadId', threadId);
        else next.delete('threadId');
        return next;
      },
      { replace: true }
    );
  }

  function handleViewChange(nextView: 'messages' | 'email') {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (nextView === 'email') next.set('view', 'email');
        else next.delete('view');
        next.delete('threadId');
        return next;
      },
      { replace: true }
    );
  }

  function clearFilters() {
    setSearchTerm('');
    handleFilterChange(ALL_SHOWS);
  }

  const handleSend = async (body: string) => {
    if (!activeThread) return;
    await sendMessage(activeThread.id, activeThread.show_id, body);
  };

  const showField: ListFilterField = {
    kind: 'options',
    key: 'show',
    label: 'Show',
    value: selectedShowId,
    onChange: value => handleFilterChange(value ?? ALL_SHOWS),
    options: shows.map(s => ({ value: s.id, label: s.name })),
  };

  const views: ListView[] = [
    { id: 'messages', label: 'Inbox', count: visibleThreads.length },
    { id: 'email', label: 'Email delivery' },
  ];

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
          'w-full flex flex-col shrink-0',
          isEmailView ? 'border-r-0' : 'md:w-80 border-r',
          effectiveActiveId && 'hidden md:flex'
        )}
      >
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Communication History</h1>
        </div>
        <div className="border-b px-4 py-3 flex flex-col gap-2">
          <ListViewTabs
            label="Communication view"
            views={views}
            activeId={isEmailView ? 'email' : 'messages'}
            onSelect={id => handleViewChange(id as 'messages' | 'email')}
          />
          <ListFilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search conversations..."
            fields={[showField]}
            onClearAll={clearFilters}
          />
        </div>
        {isEmailView ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            {selectedShowId ? <ScheduledLifecycleEmailsPanel showId={selectedShowId} /> : null}
            <EmailDeliveryHistory showId={selectedShowId} />
          </div>
        ) : visibleThreads.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">
              {selectedShowId && !searchTerm.trim()
                ? `No messages in ${showNameMap[selectedShowId] ?? 'this show'} yet.`
                : hasActiveFilters
                  ? 'No conversations match your filters.'
                  : 'No messages yet.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
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
            onSelectThread={handleSelectThread}
          />
        )}
      </div>

      <div
        className={cn(
          'flex-1 flex flex-col',
          isEmailView ? 'hidden' : !effectiveActiveId && 'hidden md:flex'
        )}
      >
        {effectiveActiveId ? (
          <>
            <div className="md:hidden p-2 border-b">
              <Button variant="ghost" size="sm" onClick={() => handleSelectThread(null)}>
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
            action={null}
            size="sm"
            className="h-full py-0 justify-center"
          />
        )}
      </div>
    </div>
  );
}
