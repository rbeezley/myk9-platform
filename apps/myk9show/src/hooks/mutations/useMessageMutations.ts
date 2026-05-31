import { useCallback, useState } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { supabase } from '@/lib/supabase-client';
import { notifications } from '@/lib/notifications';
import type { MessageTarget } from '@/features/messages/types';

export function useMessageMutations() {
  const [isSending, setIsSending] = useState(false);
  const storeSendMessage = useMessageStore(s => s.sendMessage);
  const storeMarkRead = useMessageStore(s => s.markThreadRead);
  const storeGetOrCreateThread = useMessageStore(s => s.getOrCreateThread);

  const sendMessage = useCallback(
    async (threadId: string, showId: string, body: string) => {
      setIsSending(true);
      try {
        await storeSendMessage(threadId, showId, body);
      } catch {
        notifications.error('Failed to send message');
      } finally {
        setIsSending(false);
      }
    },
    [storeSendMessage]
  );

  const markThreadRead = useCallback(
    (threadId: string) => {
      storeMarkRead(threadId);
    },
    [storeMarkRead]
  );

  const getOrCreateThread = useCallback(
    async (showId: string, participantId: string) => {
      return storeGetOrCreateThread(showId, participantId);
    },
    [storeGetOrCreateThread]
  );

  const sendTargetedMessage = useCallback(
    async (showId: string, target: MessageTarget, body: string) => {
      setIsSending(true);
      try {
        const { data, error } = await supabase.functions.invoke('send-targeted-message', {
          body: {
            show_id: showId,
            target_type: target.type,
            ...(target.classId ? { class_id: target.classId } : {}),
            body,
          },
        });

        if (error) throw error;

        notifications.success(`Message sent to ${data?.total_recipients ?? 0} exhibitors`);
        return data;
      } catch {
        notifications.error('Failed to send targeted message');
        return null;
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  return { sendMessage, markThreadRead, getOrCreateThread, sendTargetedMessage, isSending };
}
