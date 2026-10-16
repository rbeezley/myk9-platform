import { ENTRY_COCKPIT_COMPACT_WIDTH } from '@/components/entries/management/entryManagementCockpitResponsive';
import { COCKPIT_SPLIT_MIN_WIDTH } from '@/features/show-map/cockpit/cockpitSplit';
import type { ShowManagementSectionPath } from '@/routes/showManagementSections';

/** The Shows list's starting width; the user can drag it between the MIN and MAX below. */
export const SHOWS_LIST_DEFAULT_PX = 320;
export const SHOWS_LIST_MIN_PX = 260;
export const SHOWS_LIST_MAX_PX = 440;

/**
 * Width inside the split that is neither the list nor the cockpit: the drag handle and the
 * detail pane's 4px left padding (`MasterDetailLayout`), plus 17px for the detail pane's own
 * scrollbar where the platform draws a classic one (Windows, or macOS set to always show them;
 * the cockpit nearly always overflows the pane). The show page adds no side padding in the pane.
 * Measured in headless Chromium, which hides scrollbars (2026-10-15: a 1144px split, 320px list,
 * 808px cockpit), and pinned by `showsListPane.spec.ts`.
 */
const RESIZE_HANDLE_PX = 12;
const HANDLE_AND_PADDING_PX = RESIZE_HANDLE_PX + 4;
const CLASSIC_SCROLLBAR_PX = 17;
export const SHOWS_PANE_CHROME_PX = HANDLE_AND_PADDING_PX + CLASSIC_SCROLLBAR_PX;

/**
 * Entry Forms' own side padding around its cockpit (`EntryManagementPage`, `sm:p-6`: 24px a side).
 * Measured 2026-10-16: a 972px show pane held a 920px Entries cockpit (4px pane padding + 48).
 */
const ENTRY_FORMS_PAGE_PADDING_PX = 48;

/** Show tabs by their path under `/shows/:id`; `undefined` is Overview. */
export type ShowPaneTab = ShowManagementSectionPath | undefined;

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
 * The list stays beside the show only while the show, beside the list at its real width
 * (`showsListWidth`: the default unless the viewer dragged it), still gives the open tab's
 * cockpit its split (`showWidthNeeded`). Narrower, the list folds so the
 * show keeps its full width, and the "Shows" button brings the list back. The fold point is per
 * tab, so between the two widths (about a 1357 and a 1497px window) the list folds on Entry Forms
 * and returns on the other tabs. The rule reads the space this page is given, not the window, so
 * a wider or narrower app rail moves the fold point with it. Unmeasured it folds, though nothing
 * shows then: the page mounts the show only once it has measured (`ShowsMasterDetailPage`).
 */
export function showsPaneFolds(
  splitWidth: number | null,
  tab?: ShowPaneTab,
  listWidth: number = SHOWS_LIST_DEFAULT_PX
): boolean {
  if (splitWidth === null) return true;
  return splitWidth - listWidth - SHOWS_PANE_CHROME_PX < showWidthNeeded(tab);
}

/**
 * The list's real width in a split this wide (MYK9-1226). The panels save the list as a share of
 * the split, so a list dragged to 320px at a 1440px window is about 440px at 1920: assuming 320
 * kept the list open where the cockpit beside it stacks. No saved share means the default width;
 * either way the result stays within the list's drag limits.
 */
export function showsListWidth(splitWidth: number, savedPercent: number | null): number {
  if (savedPercent === null) return SHOWS_LIST_DEFAULT_PX;
  // The share is of the split less the drag handle: measured 2026-10-16, a saved 24.768% list in a
  // 1304px split was 320px (24.768% of 1292).
  const width = ((splitWidth - RESIZE_HANDLE_PX) * savedPercent) / 100;
  return Math.min(SHOWS_LIST_MAX_PX, Math.max(SHOWS_LIST_MIN_PX, width));
}
