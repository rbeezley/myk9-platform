/**
 * Access-request notification emails (MYK9-681).
 *
 * Called AFTER a request or a review has committed. The caller names the
 * event; the edge function takes recipients and content from the request row,
 * sends each email at most once, and records every
 * outcome in email_log. This wrapper never throws: an email problem must not
 * turn a saved request or decision into an error on screen, so a failure is
 * logged and the in-app result stands.
 */
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';

export type AccessRequestEmailKind = 'new_club' | 'secretary' | 'membership';
/** 'submitted' after the requester's ask saved; 'decision' after a reviewer's approve/deny saved. */
export type AccessRequestEmailEvent = 'submitted' | 'decision';

export async function notifyAccessRequestEmail(
  kind: AccessRequestEmailKind,
  requestId: string | null | undefined,
  event: AccessRequestEmailEvent
): Promise<void> {
  if (!requestId) return;
  try {
    const { error } = await supabase.functions.invoke('send-access-request-email', {
      body: { kind, requestId, event },
    });
    if (error) throw error;
  } catch (error) {
    logger.error('Access request email could not be sent', 'access-requests', {
      kind,
      requestId,
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
