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
