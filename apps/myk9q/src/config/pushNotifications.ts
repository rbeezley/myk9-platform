/**
 * Push Notification Configuration
 * Configure VAPID keys and push notification settings
 */

export interface PushNotificationConfig {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  enabled: boolean;
  serverEndpoint?: string;
}

// VAPID keys configuration
// In production, these should come from environment variables
// Generate VAPID keys using: npx web-push generate-vapid-keys
export const pushNotificationConfig: PushNotificationConfig = {
  // Public key - safe to expose to client
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,

  // Private key - NEVER expose to client, only for server use
  // This is here for reference but should be configured on the server
  vapidPrivateKey: import.meta.env.VAPID_PRIVATE_KEY,

  // Enable/disable push notifications
  enabled: import.meta.env.VITE_PUSH_NOTIFICATIONS_ENABLED === 'true' || false,

  // Server endpoint for subscription management
  serverEndpoint: import.meta.env.VITE_PUSH_SERVER_ENDPOINT || 'http://localhost:3001/api/push'
};

/**
 * Get the VAPID public key for client-side subscription
 */
export const getVapidPublicKey = (): string | undefined => {
  return pushNotificationConfig.vapidPublicKey;
};

/**
 * Check if push notifications are enabled
 */
export const isPushNotificationsEnabled = (): boolean => {
  return pushNotificationConfig.enabled && !!pushNotificationConfig.vapidPublicKey;
};

/**
 * Get server endpoint for push subscriptions
 */
export const getPushServerEndpoint = (): string | undefined => {
  return pushNotificationConfig.serverEndpoint;
};

/**
 * Validation for VAPID key format
 */
export const isValidVapidKey = (key: string): boolean => {
  // VAPID public keys should be base64url encoded and 65 bytes long when decoded
  try {
    const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.length === 65;
  } catch {
    return false;
  }
};