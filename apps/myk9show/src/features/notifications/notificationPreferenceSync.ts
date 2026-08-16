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
 * `notification_preferences.lead_dogs` is newer than the checked-in generated
 * `Database` types (migration 20260816120000), so the client is narrowed
 * structurally here — the same escape hatch `dogFavoritesSync` uses for
 * `dog_favorites`. One cast, in one place; drop it once types regenerate.
 */
interface NotificationPreferencesTable {
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string }
  ) => Promise<{ error: { message: string } | null }>;
}

function notificationPreferencesTable(): NotificationPreferencesTable {
  return (
    supabase as unknown as { from: (table: string) => NotificationPreferencesTable }
  ).from('notification_preferences');
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
    const { error } = await notificationPreferencesTable().upsert(
      {
        auth_user_id: authUserId,
        lead_dogs: leadDogs,
        push_enabled: preferences.pushEnabled,
      },
      { onConflict: 'auth_user_id' }
    );
    if (error) {
      console.warn('notification preference sync failed', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
