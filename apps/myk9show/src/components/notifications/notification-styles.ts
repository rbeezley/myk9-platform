import type { NotificationPriority } from '@myk9/notifications';

/** Priority-based left border colors shared by ToastContainer and NotificationCenter */
export const PRIORITY_BORDER: Record<NotificationPriority, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-amber-500',
  normal: 'border-l-blue-500',
};
