import { useCallback, useState } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { supabase } from '@/lib/supabase-client';
import { notifications } from '@/lib/notifications';
import type { MessageTarget } from '@/features/messages/types';
import {
  parseTargetedSendResult,
  type TargetedSendResult,
} from '@/features/show-workbench/messageShowEmail';
import { describeSendOutcome } from '@/features/show-workbench/messageShowOutcome';

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
    async (
      showId: string,
      target: MessageTarget,
      body: string
    ): Promise<TargetedSendResult | null> => {
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

        const result = parseTargetedSendResult(data);
        const outcome = describeSendOutcome({
          result,
          // An email-only call follows an announcement post, which is the in-app copy.
          announcementPosted: target.emailOnly === true,
          emailRequested: target.sendEmail === true || target.emailOnly === true,
        });
        // A skipped or failed channel is something the secretary must see and act on.
        const logNote =
          result.email?.logFailed && outcome.status !== 'none'
            ? ' Sent, but it may not show in Email delivery history.'
            : '';
        const copy = `${outcome.message}${logNote}`;
        if (outcome.status === 'none') {
          notifications.error(copy, { duration: 15000 });
        } else if (outcome.status === 'success' && !logNote && !result.email?.missing.length) {
          notifications.success(copy);
        } else {
          notifications.warning(copy, { duration: 15000 });
        }
        return result;
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
