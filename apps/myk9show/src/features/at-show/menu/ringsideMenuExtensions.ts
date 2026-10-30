/**
 * Extension point for the ringside menu (MYK9-1508).
 *
 * Add an entry here to put a new destination in the menu; the builder in
 * `ringsideMenuItems.ts` appends these after the core show-day set and before
 * Sign out, and each entry decides per viewer whether to show itself.
 *
 * The Nationals Leaderboard item lands here once its component merges
 * (MYK9-1516, PR #3423), with its staff-authorized route. Empty until then.
 */
import type { RingsideMenuExtension } from './ringsideMenuItems';

export const ringsideMenuExtensions: readonly RingsideMenuExtension[] = [];
