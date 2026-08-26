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
 * How long to wait for `navigator.serviceWorker.ready` before giving up.
 *
 * `.ready` never rejects — it simply never settles when registration failed, is
 * blocked by enterprise policy, or is unavailable in a private-browsing mode. An
 * unbounded await therefore hangs the caller forever rather than failing.
 */
export const SERVICE_WORKER_READY_TIMEOUT_MS = 2_000;

/**
 * Resolves the active service worker registration, or `null` when push cannot
 * work on this device.
 *
 * Returning `null` (rather than throwing or hanging) is deliberate: callers on
 * the ringside heartbeat path treat "no usable push endpoint" as a supported
 * state with its own fallback, and a device that cannot even query its
 * subscription is indistinguishable from one that has none.
 */
async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
 *
 * Returns `false` — never throws or hangs — when push is unsupported or the
 * service worker registration does not settle within
 * `SERVICE_WORKER_READY_TIMEOUT_MS`.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await getReadyRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

/**
 * Returns the current push subscription data, or null if not subscribed.
 *
 * Also returns `null` — never throws or hangs — when push is unsupported or the
 * service worker registration does not settle within
 * `SERVICE_WORKER_READY_TIMEOUT_MS`. Callers must treat "cannot determine a
 * subscription" the same as "has no subscription"; the ringside heartbeat
 * depends on that so its push-independent revocation check still runs.
 */
export async function getExistingSubscription(): Promise<PushSubscriptionData | null> {
  const registration = await getReadyRegistration();
  if (!registration) return null;
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
