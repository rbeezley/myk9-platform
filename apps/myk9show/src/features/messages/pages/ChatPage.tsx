import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageInput } from '@/features/messages/components/MessageInput';
import { EmptyState } from '@/components/common/EmptyState';
import { MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const { showId } = useParams<{ showId: string }>();
  const auth = useAuth();
  const user = auth.user;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const getOrCreateThread = useMessageStore(s => s.getOrCreateThread);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);

  const { sendMessage, isSending } = useMessageMutations();

  const thread = threads.find(t => t.show_id === showId && t.participant_id === user?.id);
  const messages = thread ? messagesByThread[thread.id] || [] : [];

  useEffect(() => {
    if (thread?.id) {
      fetchMessages(thread.id).then(() => {
        storeMarkThreadRead(thread.id!);
      });
    }
  }, [thread?.id, fetchMessages, storeMarkThreadRead]);

  useEffect(() => {
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSend = async (body: string) => {
    if (!showId || !user?.id) return;
    let threadId = thread?.id;
    if (!threadId) {
      const newThread = await getOrCreateThread(showId, user.id);
      if (!newThread) return;
      threadId = newThread.id;
    }
    await sendMessage(threadId, showId, body);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">Chat with the trial secretary</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Start a conversation"
            description="Send a message to the trial secretary"
            size="sm"
            className="h-full py-0 justify-center"
          />
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isOwnMessage={msg.sender_id === user?.id} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
