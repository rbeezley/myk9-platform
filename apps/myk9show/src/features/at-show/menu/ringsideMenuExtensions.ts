/**
 * Extension point for the ringside menu (MYK9-1508).
 *
 * Add an entry here to put a new destination in the menu; the builder in
 * `ringsideMenuItems.ts` appends these after the core show-day set and before
 * Sign out, and each entry decides per viewer whether to show itself.
 */
import { Trophy } from 'lucide-react';
import { getRingsideNationalsLeaderboardHref } from '@/features/results-tab/resultsTabRoutes';
import type { RingsideMenuExtension } from './ringsideMenuItems';

/**
 * Nationals shows only (MYK9-1540). Every ringside viewer sees it; what the board ranks is gated
 * by release, the same rule the Results tab applies, so an exhibitor sees released classes only.
 */
const nationalsLeaderboard: RingsideMenuExtension = {
  id: 'nationals-leaderboard',
  build: ({ showId, isNationals }) =>
    showId && isNationals
      ? {
          id: 'nationals-leaderboard',
          label: 'Nationals Leaderboard',
          icon: Trophy,
          href: getRingsideNationalsLeaderboardHref(showId),
          returnScope: getRingsideNationalsLeaderboardHref(showId),
          requiresConnection: false,
        }
      : null,
};

export const ringsideMenuExtensions: readonly RingsideMenuExtension[] = [nationalsLeaderboard];
