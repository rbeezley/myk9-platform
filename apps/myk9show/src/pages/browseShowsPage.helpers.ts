import type { ViewMode } from './browseShowsViewModes';

/**
 * Cards for everyone except the secretary/admin Managing tab, whose working
 * list is the table. Guests and multi-role users used to land on the table,
 * which needed a horizontal scrollbar to read (MYK9-427).
 */
export function getDefaultViewMode(selectedTab: string): ViewMode {
  return selectedTab === 'managing' ? 'table' : 'cards';
}

export const SHOWS_UNAVAILABLE = "We couldn't load the shows.";
/** A signed-out guest's list is online-only (MYK9-780), so offline says so. */
export const SHOWS_OFFLINE = "You're offline. Connect to the internet to see shows.";
