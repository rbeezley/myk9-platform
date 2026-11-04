import { useCallback, useState } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { supabase } from '@/lib/supabase-client';
import { notifications } from '@/lib/notifications';
import type { MessageTarget } from '@/features/messages/types';
import {
  buildEmailResultCopy,
  parseMessageShowEmailResult,
} from '@/features/show-workbench/messageShowEmail';

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
            send_push: target.sendPush === true,
            ...(target.sendEmail || target.emailOnly ? { send_email: true } : {}),
            ...(target.emailOnly ? { email_only: true } : {}),
            body,
          },
        });

        if (error) throw error;

        const recipientCount = Number(data?.total_recipients ?? data?.sent_to ?? 0);
        if (recipientCount <= 0) {
          notifications.error('No matching recipients to message');
          return null;
        }

        const email = parseMessageShowEmailResult(data);
        const inApp = target.emailOnly ? '' : `Message sent to ${recipientCount} exhibitors. `;
        if (email) {
          const copy = `${inApp}${buildEmailResultCopy(email)}`.trim();
          // A skipped or failed address is something the secretary must see and act on.
          const needsAttention = email.failed > 0 || email.missing.length > 0;
          if (needsAttention) {
            notifications.warning(copy, { duration: 15000 });
          } else {
            notifications.success(copy);
          }
        } else {
          notifications.success(`Message sent to ${recipientCount} exhibitors`);
        }
        return data;
      } catch {
        notifications.error(
          target.emailOnly
            ? 'Posted in the app, but the email could not be sent'
            : 'Failed to send targeted message'
        );
        return null;
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  return { sendMessage, markThreadRead, getOrCreateThread, sendTargetedMessage, isSending };
}
