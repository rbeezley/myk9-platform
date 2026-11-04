import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import {
  parseMessageShowEmailResult,
  type MessageShowEmailResult,
} from '@/features/show-workbench/messageShowEmail';
import type { MessageTarget } from '@/features/messages/types';

/**
 * Counts, without sending anything, who "also send by email" would reach for an
 * audience. The server resolves it (the same code path as the real send), so the
 * count shown before Send is the count that gets mailed. Online-only by design.
 */
export function useMessageEmailAudience(
  showId: string,
  target: MessageTarget | null,
  enabled: boolean
) {
  return useQuery<MessageShowEmailResult>({
    queryKey: ['message-email-audience', showId, target?.type, target?.classId ?? null],
    enabled: enabled && !!target,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-targeted-message', {
        body: {
          show_id: showId,
          target_type: target?.type,
          ...(target?.classId ? { class_id: target.classId } : {}),
          send_email: true,
          dry_run: true,
          body: 'preview',
        },
      });
      if (error) throw error;
      const parsed = parseMessageShowEmailResult(data);
      if (!parsed) throw new Error('Email recipient count unavailable');
      return parsed;
    },
  });
}
