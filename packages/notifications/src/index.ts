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

export { speak, speakWithConfig, cancelSpeech, isSpeechSupported } from './voice';

export type { VoiceCategories, VoiceConfig } from './types';
export { NOTIFICATION_TYPE_TO_VOICE_CATEGORY } from './types';

export type { PushSubscriptionData, PushSubscriptionLookup } from './push';
export {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
  lookupExistingSubscription,
  SERVICE_WORKER_READY_TIMEOUT_MS,
} from './push';
