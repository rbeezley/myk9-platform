import { Bell, MessageSquare } from 'lucide-react';

export type MessageCenterTab = 'notifications' | 'showMessages';

// Display order: pickOpenTab returns the first tab here that holds unread items.
export const MESSAGE_CENTER_TABS = [
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'showMessages', label: 'Show messages', icon: MessageSquare },
] as const satisfies ReadonlyArray<{ key: MessageCenterTab; label: string; icon: unknown }>;

export type MessageCenterTabUnread = Record<MessageCenterTab, number>;

/**
 * INTENT: an exhibitor who sees "N unread" must land on the tab that holds them.
 * Chosen once when the panel opens (never re-run while open, so the tab does not
 * jump under the cursor); with nothing unread the default stays Notifications.
 */
export function pickOpenTab(unread: MessageCenterTabUnread): MessageCenterTab {
  return MESSAGE_CENTER_TABS.find(tab => unread[tab.key] > 0)?.key ?? 'notifications';
}
