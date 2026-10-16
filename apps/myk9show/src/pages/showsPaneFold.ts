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
 * Whether the Shows list folds away while a show is open, given the width the split has
 * (`splitWidth`, null until measured).
 *
 * The list stays beside the show only while the show, beside a list at its default width, still
 * gives the cockpit its schedule / focus split (`COCKPIT_SPLIT_MIN_WIDTH`). Narrower, the list
 * folds so the show keeps its full width, and the "Shows" button brings the list back. The rule
 * reads the space this page is given, not the window, so a wider or narrower app rail moves the
 * fold point with it. Unmeasured it folds, though nothing shows then: the page mounts the show only
 * once it has measured (`ShowsMasterDetailPage`).
 */
export function showsPaneFolds(splitWidth: number | null): boolean {
  if (splitWidth === null) return true;
  return splitWidth - SHOWS_LIST_DEFAULT_PX - SHOWS_PANE_CHROME_PX < COCKPIT_SPLIT_MIN_WIDTH;
}
