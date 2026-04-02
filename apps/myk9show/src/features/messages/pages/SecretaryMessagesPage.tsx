import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { supabase } from '@/lib/supabase-client';
import { ThreadList } from '@/features/messages/components/ThreadList';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageInput } from '@/features/messages/components/MessageInput';
import { ComposeTargetedModal } from '@/features/messages/components/ComposeTargetedModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/common/EmptyState';
import { MessageSquare, Users } from 'lucide-react';

export default function SecretaryMessagesPage() {
  const { showId } = useParams<{ showId: string }>();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showTargetedModal, setShowTargetedModal] = useState(false);

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);

  const { sendMessage, sendTargetedMessage, isSending } = useMessageMutations();

  const { data: classes = [] } = useQuery({
    queryKey: ['show-classes-for-messages', showId],
    queryFn: async () => {
      if (!showId) return [];
      const { data } = await supabase
        .from('classes')
        .select('id, class_number, name, trials!inner(show_id)')
        .eq('trials.show_id' as string, showId)
        .order('class_number');
      const withCounts = await Promise.all(
        (data || []).map(async (c: { id: string; class_number: string | null; name: string }) => {
          const { count } = await supabase
            .from('entries')
            .select('id', { count: 'exact', head: true })
            .eq('class_id', c.id)
            .is('deleted_at', null);
          return {
            id: c.id,
            class_number: Number(c.class_number ?? 0),
            class_name: c.name,
            entry_count: count ?? 0,
          };
        })
      );
      return withCounts;
    },
    enabled: !!showId,
  });

  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];
  const showThreads = threads.filter(t => t.show_id === showId);

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId).then(() => {
        storeMarkThreadRead(activeThreadId);
      });
    }
  }, [activeThreadId, fetchMessages, storeMarkThreadRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const handleSend = async (body: string) => {
    if (!activeThreadId || !showId) return;
    await sendMessage(activeThreadId, showId, body);
  };

  const handleTargetedSend = async (classId: string, body: string) => {
    if (!showId) return;
    await sendTargetedMessage(showId, classId, body);
  };

  if (isLoading) {
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
          activeThreadId && 'hidden md:flex'
        )}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="text-lg font-semibold">Messages</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTargetedModal(true)}
            aria-label="Message class"
          >
            <Users className="h-4 w-4 mr-1" />
            Message Class
          </Button>
        </div>
        <ThreadList
          threads={showThreads}
          activeThreadId={activeThreadId}
          onSelectThread={setActiveThreadId}
        />
      </div>

      <div className={cn('flex-1 flex flex-col', !activeThreadId && 'hidden md:flex')}>
        {activeThreadId ? (
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

      <ComposeTargetedModal
        open={showTargetedModal}
        onClose={() => setShowTargetedModal(false)}
        onSend={handleTargetedSend}
        classes={classes}
      />
    </div>
  );
}
