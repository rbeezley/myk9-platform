/**
 * Decides whether the at-show entry list should surface the Add-to-Home nudge
 * because favorite push alerts cannot be delivered yet (MYK9-79).
 *
 * iOS only delivers web push to an INSTALLED PWA. A signed-in user who has
 * favorited a dog and turned alerts on has asked for something the browser
 * cannot give them until they install — that, and only that, is worth a nudge.
 * It reuses `useAtShowStoragePersistence`, so there is one nudge on the at-show
 * surface with two reasons rather than a second competing prompt.
 */

import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';
import {
  useAtShowStoragePersistence,
  type AtShowStoragePersistence,
} from './useAtShowStoragePersistence';

export function useAtShowFavoriteAlertNudge(
  favoriteArmbands: ReadonlySet<number>
): AtShowStoragePersistence {
  const { user } = useAuthContext();
  const preferences = useNotificationStore(state => state.preferences);

  // Anonymous passcode sessions can hold no push subscription at all
  // (push_subscriptions.user_id FKs auth.users), so never nudge them for alerts.
  const favoriteAlertsPending =
    Boolean(user?.id) &&
    favoriteArmbands.size > 0 &&
    preferences.enabled &&
    preferences.pushEnabled;

  return useAtShowStoragePersistence({ favoriteAlertsPending });
}
