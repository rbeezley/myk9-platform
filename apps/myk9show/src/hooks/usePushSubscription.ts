import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  lookupExistingSubscription,
} from '@myk9/notifications';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';

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

  /** Upserts this device's subscription for the signed-in auth user. Shared by subscribe and reconcile. */
  async function saveSubscription(
    userId: string,
    data: { endpoint: string; keys: { p256dh: string; auth: string } }
  ) {
    return supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
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

      const { error } = await saveSubscription(user.id, subscriptionData);

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

  /**
   * Aligns the persisted `pushEnabled` flag with what this device really holds.
   * Never prompts and never creates a subscription: a browser subscription the
   * server lacks (or holds for another user) is re-saved for the current user;
   * anything else reads Off. `unavailable` (could not ask) leaves it untouched.
   */
  async function reconcile(): Promise<void> {
    if (!user?.id) return;

    // A device that cannot do push (or a build without a VAPID key) can never
    // receive one, so a stale local "On" must not survive here either.
    if (
      !isSupported ||
      (typeof Notification !== 'undefined' && Notification.permission === 'denied')
    ) {
      updatePreferences({ pushEnabled: false });
      return;
    }

    try {
      const lookup = await lookupExistingSubscription();
      if (lookup.status === 'unavailable') return;
      if (lookup.status === 'none') {
        updatePreferences({ pushEnabled: false });
        return;
      }
      const { error } = await saveSubscription(user.id, lookup.subscription);
      if (error) {
        console.error('Failed to re-save push subscription:', error.message);
      }
      updatePreferences({ pushEnabled: !error });
    } catch (err) {
      console.error('Push reconcile failed:', err);
      updatePreferences({ pushEnabled: false });
    }
  }

  return { subscribe, unsubscribe, reconcile, isSupported };
}
