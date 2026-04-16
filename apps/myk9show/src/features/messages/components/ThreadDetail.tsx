import { useEffect, useRef } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useAuth } from '@/hooks/useAuth';
import type { MessageThread } from '@/features/messages/types';

interface ThreadDetailProps {
  thread: MessageThread;
}

export function ThreadDetail({ thread }: ThreadDetailProps) {
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const markThreadRead = useMessageStore(s => s.markThreadRead);

  const { sendMessage } = useMessageMutations();

  const messages = messagesByThread[thread.id] ?? [];

  useEffect(() => {
    fetchMessages(thread.id).then(() => {
      markThreadRead(thread.id);
    });
  }, [thread.id, fetchMessages, markThreadRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (body: string) => {
    await sendMessage(thread.id, thread.show_id, body);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <p className="font-medium text-sm">{thread.participant_name ?? 'Unknown participant'}</p>
        {thread.show_name && <p className="text-xs text-muted-foreground">{thread.show_name}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isOwnMessage={msg.sender_id === user?.id} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t px-4 py-3">
        <MessageInput onSend={handleSend} disabled={false} />
      </div>
    </div>
  );
}
