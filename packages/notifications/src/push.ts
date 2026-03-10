export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Checks whether the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof Notification !== 'undefined'
  );
}

/**
 * Requests notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Converts a base64-encoded VAPID key to Uint8Array for the Push API.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, char => char.charCodeAt(0));
}

/**
 * Subscribes to push notifications using VAPID key.
 * Returns subscription data to be saved server-side, or existing subscription.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionData> {
  const registration = await navigator.serviceWorker.ready;

  // Check for existing subscription
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return extractSubscriptionData(existing);
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  return extractSubscriptionData(subscription);
}

/**
 * Unsubscribes from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

/**
 * Returns the current push subscription data, or null if not subscribed.
 */
export async function getExistingSubscription(): Promise<PushSubscriptionData | null> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  return extractSubscriptionData(subscription);
}

function extractSubscriptionData(subscription: PushSubscription): PushSubscriptionData {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh as string,
      auth: json.keys!.auth as string,
    },
  };
}
