import type { NotificationPayload } from '@myk9/notifications';

/** A row from the durable `public.notifications` table. */
export interface AccountNotificationRow {
  id: string;
  type: string;
  message: string;
  deep_link_url: string | null;
  created_at: string;
}

/** The bell title for each durable row type; anything else reads as an account update. */
const ACCOUNT_NOTIFICATION_TITLES: Readonly<Record<string, string>> = {
  waitlist_auto_offer: 'Wait list offer sent',
  waitlist_mail_in_head: 'Mail-in dog needs an offer',
};

/**
 * Maps a durable `public.notifications` row to the in-memory alert payload
 * the bell/Message Center already knows how to render. Every DB notification
 * type reads as the existing 'announcement' NotificationType — deliberately
 * reusing the closed union instead of widening it for one row kind (MYK9-859).
 */
export function buildAccountNotificationPayload(
  row: AccountNotificationRow,
  userId: string
): NotificationPayload {
  return {
    id: row.id,
    type: 'announcement',
    title: ACCOUNT_NOTIFICATION_TITLES[row.type] ?? 'Account update',
    body: row.message,
    priority: 'normal',
    data: { accountNotificationUserId: userId },
    timestamp: new Date(row.created_at).getTime(),
    // exactOptionalPropertyTypes forbids `actionUrl: undefined` — omit the
    // key entirely rather than setting it to a value the type disallows.
    ...(row.deep_link_url ? { actionUrl: row.deep_link_url } : {}),
  };
}
