/**
 * Extension point for the ringside menu (MYK9-1508).
 *
 * Add an entry here to put a new destination in the menu; the builder in
 * `ringsideMenuItems.ts` appends these after the core show-day set and before
 * Sign out, and each entry decides per viewer whether to show itself.
 */
import { Trophy } from 'lucide-react';
import { getAtShowLeaderboardHref } from '../atShowLeaderboardRoutes';
import type { RingsideMenuExtension } from './ringsideMenuItems';

/**
 * Nationals Leaderboard (MYK9-1540): nationals shows only, for ringside staff. An exhibitor's
 * replica holds only their own dogs, so a board built from it would rank a partial field; the
 * item is hidden for them rather than showing wrong ranks.
 */
const nationalsLeaderboard: RingsideMenuExtension = {
  id: 'nationals-leaderboard',
  build: ({ showId, isNationals, isStaff }) => {
    if (!showId || isNationals !== true || isStaff !== true) return null;
    const href = getAtShowLeaderboardHref(showId);
    return {
      id: 'nationals-leaderboard',
      label: 'Nationals Leaderboard',
      icon: Trophy,
      href,
      returnScope: href,
      requiresConnection: false,
    };
  },
};

export const ringsideMenuExtensions: readonly RingsideMenuExtension[] = [nationalsLeaderboard];
