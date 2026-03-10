import { useCallback } from 'react';
import type { NotificationPayload } from '@myk9/notifications';
import {
  shouldSuppress,
  playNotificationSound,
  speak,
  generateVoiceText,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { notifications } from '@/lib/notifications';

/**
 * Returns a `deliver` function that sends a notification through all enabled channels:
 * toast, sound, voice, vibration, and push (background tab).
 */
export function useNotificationDelivery() {
  const preferences = useNotificationStore(s => s.preferences);
  const isInRing = useNotificationStore(s => s.isInRing);
  const addAlert = useNotificationStore(s => s.addAlert);

  const deliver = useCallback(
    (payload: NotificationPayload) => {
      // Check suppression
      if (shouldSuppress(preferences, { isInRing })) return;

      // Always add to store (for bell dropdown)
      addAlert(payload);

      // [EXPANDED] Each channel is wrapped in try/catch so one failure
      // doesn't prevent other channels from delivering.

      // Toast (always)
      try {
        const toastMethod =
          payload.priority === 'urgent'
            ? notifications.warning
            : payload.priority === 'high'
              ? notifications.warning
              : notifications.info;
        toastMethod(payload.title, { description: payload.body });
      } catch {
        /* toast failure is non-fatal */
      }

      // Sound
      if (preferences.soundEnabled) {
        try {
          playNotificationSound(payload.priority);
        } catch {
          /* sound failure is non-fatal */
        }
      }

      // Voice
      if (preferences.voiceEnabled) {
        try {
          const voiceText = generateVoiceText(payload);
          if (voiceText) {
            speak(voiceText.text);
          }
        } catch {
          /* voice failure is non-fatal */
        }
      }

      // Vibration
      if (preferences.vibrationEnabled && navigator.vibrate) {
        const pattern = payload.priority === 'urgent' ? [200, 100, 200, 100, 200] : [150];
        navigator.vibrate(pattern);
      }

      // [ADDED] Push — not client-triggered. Push notifications are server-side:
      // Supabase realtime database webhooks call the send-push-notification edge function
      // when relevant DB changes occur. The service worker (sw-custom.ts) handles
      // incoming push events when the tab is backgrounded. No client-side push
      // delivery is needed in this hook.
    },
    [preferences, isInRing, addAlert]
  );

  return { deliver };
}
