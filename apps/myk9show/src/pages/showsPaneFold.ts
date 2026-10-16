import { ENTRY_COCKPIT_COMPACT_WIDTH } from '@/components/entries/management/entryManagementCockpitResponsive';
import { COCKPIT_SPLIT_MIN_WIDTH } from '@/features/show-map/cockpit/cockpitSplit';

/** The Shows list's starting width; the user can drag it between 260 and 440. */
export const SHOWS_LIST_DEFAULT_PX = 320;

/**
 * Width inside the split that is neither the list nor the cockpit: the 12px drag handle and the
 * detail pane's 4px left padding (`MasterDetailLayout`), plus 17px for the detail pane's own
 * scrollbar where the platform draws a classic one (Windows, or macOS set to always show them;
 * the cockpit nearly always overflows the pane). The show page adds no side padding in the pane.
 * Measured in headless Chromium, which hides scrollbars (2026-10-15: a 1144px split, 320px list,
 * 808px cockpit), and pinned by `showsListPane.spec.ts`.
 */
const HANDLE_AND_PADDING_PX = 16;
const CLASSIC_SCROLLBAR_PX = 17;
export const SHOWS_PANE_CHROME_PX = HANDLE_AND_PADDING_PX + CLASSIC_SCROLLBAR_PX;

/**
 * Entry Forms' own side padding around its cockpit (`EntryManagementPage`, `sm:p-6`: 24px a side).
 * Measured 2026-10-16: a 972px show pane held a 920px Entries cockpit (4px pane padding + 48).
 */
const ENTRY_FORMS_PAGE_PADDING_PX = 48;

/** Show tabs by their path under `/shows/:id`; `undefined` is Overview. */
export type ShowPaneTab = 'entries' | 'results' | 'reports' | undefined;

/**
 * The width the open tab needs from the show before its cockpit stacks (MYK9-1222): Entry Forms
 * splits its queue and detail from `ENTRY_COCKPIT_COMPACT_WIDTH` of its own width; every other tab
 * follows Overview's schedule / focus split (`COCKPIT_SPLIT_MIN_WIDTH`). One rule, per tab.
 */
export function showWidthNeeded(tab: ShowPaneTab): number {
  return tab === 'entries'
    ? ENTRY_COCKPIT_COMPACT_WIDTH + ENTRY_FORMS_PAGE_PADDING_PX
    : COCKPIT_SPLIT_MIN_WIDTH;
}

/**
 * Whether the Shows list folds away while a show is open, given the width the split has
 * (`splitWidth`, null until measured) and the show tab that is open.
 *
 * The list stays beside the show only while the show, beside a list at its default width, still
 * gives the open tab's cockpit its split (`showWidthNeeded`). Narrower, the list folds so the
 * show keeps its full width, and the "Shows" button brings the list back. The fold point is per
 * tab, so between the two widths (about a 1357 and a 1497px window) the list folds on Entry Forms
 * and returns on the other tabs. The rule reads the space this page is given, not the window, so
 * a wider or narrower app rail moves the fold point with it. Unmeasured it folds, though nothing
 * shows then: the page mounts the show only once it has measured (`ShowsMasterDetailPage`).
 */
export function showsPaneFolds(splitWidth: number | null, tab?: ShowPaneTab): boolean {
  if (splitWidth === null) return true;
  return splitWidth - SHOWS_LIST_DEFAULT_PX - SHOWS_PANE_CHROME_PX < showWidthNeeded(tab);
}
