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

export type { VoiceAnnouncementText } from './voice-text';
export { generateVoiceText } from './voice-text';

export { playNotificationSound, testSound } from './sound';

export { speak, cancelSpeech, isSpeechSupported } from './voice';

export type { PushSubscriptionData } from './push';
export {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from './push';
