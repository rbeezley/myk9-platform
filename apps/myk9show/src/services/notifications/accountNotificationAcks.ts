import { ensureError } from '@myk9/core';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import type { AlertEntry } from '@/store/notificationStore';

/** Acknowledge only account notices belonging to the current signed-in user. */
export function acknowledgeAccountNotifications(
  alerts: readonly AlertEntry[],
  userId: string | null
): void {
  if (!userId) return;
  const ids = alerts
    .filter(alert => alert.payload.data?.accountNotificationUserId === userId)
    .map(alert => alert.payload.id);
  if (ids.length === 0) return;

  void supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids)
    .then(({ error }) => {
      if (error) {
        logger.error(
          'Failed to mark account notifications read',
          'notifications',
          {},
          ensureError(error)
        );
      }
    });
}
