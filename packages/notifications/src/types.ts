/** Notification event types triggered by show-day activity */
export type NotificationType =
  | 'your_turn'
  | 'results_posted'
  | 'class_starting'
  | 'check_in_reminder'
  | 'announcement';

/** Audio/visual urgency tier */
export type NotificationPriority = 'normal' | 'high' | 'urgent';

/** Payload delivered through all channels (toast, sound, voice, push) */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  actionUrl?: string;
  timestamp: number;
}

/** User's per-device notification preferences (persisted to localStorage) */
export interface NotificationPreferences {
  /** Master on/off toggle */
  enabled: boolean;
  /** How many dogs ahead triggers "your turn" alert (1-5) */
  leadDogs: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
  pushEnabled: boolean;
}

/** Default preferences for new users */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  leadDogs: 3,
  soundEnabled: true,
  voiceEnabled: false,
  vibrationEnabled: true,
  pushEnabled: false,
};

/** Context passed to suppression checks */
export interface SuppressionContext {
  isInRing: boolean;
}

/** Per-category voice toggle map */
export interface VoiceCategories {
  runOrder: boolean;
  results: boolean;
  classStarting: boolean;
  announcements: boolean;
}

/** Voice configuration for speech synthesis */
export interface VoiceConfig {
  voiceName: string; // '' = browser default
  voiceRate: number; // 0.5–2.0
}

/** Maps NotificationType to VoiceCategories key */
export const NOTIFICATION_TYPE_TO_VOICE_CATEGORY: Record<string, keyof VoiceCategories | null> = {
  your_turn: 'runOrder',
  results_posted: 'results',
  class_starting: 'classStarting',
  announcement: 'announcements',
  check_in_reminder: null,
};
