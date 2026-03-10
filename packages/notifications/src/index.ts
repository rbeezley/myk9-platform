// @myk9/notifications — public API
export type {
  NotificationType,
  NotificationPriority,
  NotificationPayload,
  NotificationPreferences,
  SuppressionContext,
} from './types';

export { DEFAULT_PREFERENCES } from './types';

export { shouldSuppress } from './suppression';

export {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
  buildAnnouncementPayload,
} from './handlers';
