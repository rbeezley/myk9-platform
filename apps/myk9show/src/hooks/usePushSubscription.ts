import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  lookupExistingSubscription,
} from '@myk9/notifications';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';

/** The claim RPC is newer than the generated `Database` types; narrow it here. */
interface PushSubscriptionRpc {
  rpc: (
    functionName: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: { message: string } | null }>;
}

function pushSubscriptionRpc(): PushSubscriptionRpc {
  return supabase as unknown as PushSubscriptionRpc;
}

/** `unavailable`: the browser could not say yet (service worker not ready). */
export type ReconcileOutcome = 'settled' | 'unavailable';

/**
 * Manages the push subscription lifecycle:
 * subscribe (browser + Supabase), unsubscribe, and sync status.
 */
export function usePushSubscription() {
  const { user } = useAuthContext();
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const requestPermission = useNotificationStore(s => s.requestPermission);

  // Read env inside hook body so tests can stub before import
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const isSupported = isPushSupported() && !!vapidKey;

  /**
   * Claims this device's endpoint for the signed-in auth user. Shared by
   * subscribe and reconcile. Goes through a SECURITY DEFINER RPC because the
   * endpoint may still belong to another account that used this browser, and
   * RLS would refuse a direct upsert onto that row.
   */
  async function saveSubscription(data: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) {
    return pushSubscriptionRpc().rpc('claim_my_push_subscription', {
      p_endpoint: data.endpoint,
      p_p256dh: data.keys.p256dh,
      p_auth: data.keys.auth,
    });
  }

  async function subscribe(): Promise<{ ok: boolean; reason?: string }> {
    if (!user?.id || !vapidKey) return { ok: false, reason: 'not-supported' };

    // Request notification permission if needed — read live value to avoid stale closure
    const currentPermission =
      typeof Notification !== 'undefined' ? Notification.permission : 'denied';
    if (currentPermission === 'default') {
      await requestPermission();
    }

    // Check permission after request
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    try {
      const subscriptionData = await subscribeToPush(vapidKey);

      const { error } = await saveSubscription(subscriptionData);

      if (error) {
        console.error('Failed to save push subscription:', error.message);
        return { ok: false, reason: 'save-failed' };
      }

      updatePreferences({ pushEnabled: true });
      return { ok: true };
    } catch (err) {
      console.error('Push subscription failed:', err);
      return { ok: false, reason: 'subscribe-failed' };
    }
  }

  async function unsubscribe(): Promise<{ ok: boolean }> {
    if (!user?.id) return { ok: true };

    try {
      const lookup = await lookupExistingSubscription();

      // `unavailable` means the browser could not tell us whether this device
      // holds a subscription — NOT that it holds none. Deleting nothing and
      // reporting success here would flip the toggle off while the
      // push_subscriptions row (and possibly the live browser subscription)
      // survives, so the user keeps receiving notifications they opted out of.
      // Leave the preference on and report failure so the caller can retry.
      //
      // Bail BEFORE unsubscribeFromPush: if the registration became ready in
      // the moment between the two calls, that call would succeed and drop the
      // browser subscription while we still return without deleting the server
      // row — and the retry, now seeing no subscription, could never identify
      // which row to delete.
      if (lookup.status === 'unavailable') {
        console.error('Push unsubscribe: subscription state unavailable; server row not removed');
        return { ok: false };
      }

      await unsubscribeFromPush();

      if (lookup.status === 'subscribed') {
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', lookup.subscription.endpoint);

        if (error) {
          console.error('Failed to delete push subscription:', error.message);
          updatePreferences({ pushEnabled: false });
          return { ok: false };
        }
      }

      updatePreferences({ pushEnabled: false });
      return { ok: true };
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      updatePreferences({ pushEnabled: false });
      return { ok: false };
    }
  }

  /** The account-level opt-out the server senders honour; null when unknown. */
  async function serverPushEnabled(userId: string): Promise<boolean | null> {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('push_enabled')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.push_enabled ?? null;
  }

  /**
   * Aligns the persisted `pushEnabled` flag with what the server can actually
   * do for this device. Never prompts and never creates a subscription:
   * - the browser holds a subscription → re-saved for the current user; On only
   *   if that save succeeds (the claim RPC failing reads Off) and the account has not opted out server-side;
   * - no subscription, denied permission or an unsupported device → Off;
   * - `unavailable` (could not ask) → left untouched and reported as
   *   `'unavailable'` so the caller can retry once the worker is ready.
   * It never writes the server opt-out flag itself: a device-local state must
   * not switch the whole account's alerts on or off.
   */
  async function reconcile(): Promise<ReconcileOutcome> {
    if (!user?.id) return 'settled';

    // A device that cannot do push (or a build without a VAPID key) can never
    // receive one, so a stale local "On" must not survive here either.
    if (
      !isSupported ||
      (typeof Notification !== 'undefined' && Notification.permission === 'denied')
    ) {
      updatePreferences({ pushEnabled: false });
      return 'settled';
    }

    try {
      const lookup = await lookupExistingSubscription();
      if (lookup.status === 'unavailable') return 'unavailable';
      if (lookup.status === 'none') {
        updatePreferences({ pushEnabled: false });
        return 'settled';
      }
      const { error } = await saveSubscription(lookup.subscription);
      if (error) {
        console.error('Failed to re-save push subscription:', error.message);
        updatePreferences({ pushEnabled: false });
        return 'settled';
      }
      // The senders skip an account whose server flag is false, so reading On
      // here would be the same lie this reconcile exists to remove.
      const optedIn = (await serverPushEnabled(user.id)) !== false;
      updatePreferences({ pushEnabled: optedIn });
    } catch (err) {
      console.error('Push reconcile failed:', err);
      updatePreferences({ pushEnabled: false });
    }
    return 'settled';
  }

  return { subscribe, unsubscribe, reconcile, isSupported };
}
