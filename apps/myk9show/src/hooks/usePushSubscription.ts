import { useCallback } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
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

  // subscribe wraps all async calls in try/catch for graceful failure
  const subscribe = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
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
      // Subscribe in browser
      const subscriptionData = await subscribeToPush(vapidKey);

      // Save to Supabase (upsert on user_id + endpoint)
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscriptionData.endpoint,
          keys: subscriptionData.keys,
        },
        { onConflict: 'user_id,endpoint' }
      );

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
  }, [user?.id, vapidKey, requestPermission, updatePreferences]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean }> => {
    if (!user?.id) return { ok: true };

    try {
      const existing = await getExistingSubscription();
      await unsubscribeFromPush();

      if (existing) {
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', existing.endpoint);

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
  }, [user?.id, updatePreferences]);

  return { subscribe, unsubscribe, isSupported };
}
