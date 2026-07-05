import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useMarkSupportTicketMessagesRead,
  usePostSupportTicketMessage,
  useSupportTicketMessages,
} from './useSupportTickets';

interface SupportTicketThreadProps {
  ticketId: string;
  currentUserId: string;
  isOperator?: boolean;
}

export function SupportTicketThread({
  ticketId,
  currentUserId,
  isOperator = false,
}: SupportTicketThreadProps) {
  const [reply, setReply] = useState('');
  const messages = useSupportTicketMessages(ticketId);
  const { mutate: markMessagesRead, error: markReadError } = useMarkSupportTicketMessagesRead(
    ticketId,
    currentUserId
  );
  const postMessage = usePostSupportTicketMessage(ticketId);
  const threadError = messages.error ?? postMessage.error ?? markReadError;

  useEffect(() => {
    if (messages.data?.some(message => message.senderId !== currentUserId && !message.readAt)) {
      markMessagesRead();
    }
  }, [currentUserId, markMessagesRead, messages.data]);

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = reply.trim();
    if (!trimmed) return;
    postMessage.mutate(
      {
        ticketId,
        senderId: currentUserId,
        body: trimmed,
        isFromOperator: isOperator,
      },
      { onSuccess: () => setReply('') }
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {messages.isLoading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-10 rounded-lg bg-muted" />
            <div className="h-10 w-3/4 rounded-lg bg-muted" />
          </div>
        )}

        {messages.data?.map(message => {
          const mine = message.senderId === currentUserId;
          return (
            <div key={message.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  mine
                    ? 'max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'max-w-[85%] rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
                }
              >
                {message.body}
              </div>
            </div>
          );
        })}
      </div>

      {threadError && (
        <Alert variant="destructive">
          <AlertDescription>
            {threadError instanceof Error
              ? threadError.message
              : 'Could not update the ticket thread.'}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={submitReply} className="flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={event => setReply(event.target.value)}
          placeholder="Reply"
          className="min-h-11 flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send reply"
          disabled={!reply.trim() || postMessage.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
