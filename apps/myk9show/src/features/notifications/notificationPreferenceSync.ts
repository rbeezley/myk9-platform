/**
 * notificationPreferenceSync — mirrors the notification preferences that a
 * SERVER-SIDE sender needs into `public.notification_preferences`.
 *
 * The store itself stays client-owned (zustand -> localStorage): it drives
 * in-app toasts, voice, and sounds, none of which the server cares about. Two
 * fields are different — `leadDogs` and `pushEnabled` decide whether
 * push-trigger-run-proximity sends a "you're N dogs away" push while the PWA is
 * CLOSED, so they must exist server-side or the exhibitor's setting silently
 * stops applying in exactly the case the feature exists for.
 *
 * Best-effort by design: a failed mirror must never block the settings UI. The
 * server falls back to the column defaults (push on, 3 dogs out), which is the
 * documented intent for an account that has never opened settings.
 */

import { supabase } from '@/lib/supabase';

export interface SyncableNotificationPreferences {
  leadDogs: number;
  pushEnabled: boolean;
}

/**
 * The caller-derived RPC is newer than the checked-in generated `Database`
 * types, so the client is narrowed structurally in one place. Drop the cast
 * once types regenerate after the hardening migration is applied.
 */
interface NotificationPreferencesRpc {
  rpc: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
}

function notificationPreferencesRpc(): NotificationPreferencesRpc {
  return supabase as unknown as NotificationPreferencesRpc;
}

export async function syncNotificationPreferences(
  authUserId: string | null | undefined,
  preferences: SyncableNotificationPreferences
): Promise<boolean> {
  if (!authUserId) return false;

  // Clamped to the CHECK constraint (1-5) so a bad local value can't 400 the
  // request — the slider already bounds it, but the store is persisted and
  // hand-editable in localStorage.
  const leadDogs = Math.min(5, Math.max(1, Math.round(preferences.leadDogs)));

  try {
    const { data, error } = await notificationPreferencesRpc().rpc(
      'set_my_notification_preferences',
      {
        p_lead_dogs: leadDogs,
        p_push_enabled: preferences.pushEnabled,
      }
    );
    if (error || data !== true) {
      console.warn('notification preference sync failed', error?.message ?? 'unexpected response');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
