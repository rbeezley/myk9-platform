import { useCallback } from 'react';
import type { NotificationPayload } from '@myk9/notifications';
import {
  shouldSuppress,
  playNotificationSound,
  speak,
  generateVoiceText,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useToastStore } from '@/store/toastStore';

/**
 * Returns a `deliver` function that sends a notification through all enabled channels:
 * toast (custom ToastContainer), sound, voice, vibration, and push (background tab).
 */
export function useNotificationDelivery() {
  const preferences = useNotificationStore(s => s.preferences);
  const isInRing = useNotificationStore(s => s.isInRing);
  const addAlert = useNotificationStore(s => s.addAlert);
  const addToast = useToastStore(s => s.addToast);

  const deliver = useCallback(
    (payload: NotificationPayload) => {
      // Check suppression
      if (shouldSuppress(preferences, { isInRing })) return;

      // Always add to store (for bell dropdown + center)
      addAlert(payload);

      // Toast (custom ToastContainer — NOT Sonner; Sonner remains for app-wide CRUD toasts)
      try {
        addToast(payload);
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

      // Push is server-triggered (database webhooks → edge function → service worker).
      // No client-side push delivery needed in this hook.
    },
    [preferences, isInRing, addAlert, addToast]
  );

  return { deliver };
}
