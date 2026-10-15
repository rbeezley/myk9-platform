import { COCKPIT_SPLIT_MIN_WIDTH } from '@/features/show-map/cockpit/cockpitSplit';

/** The Shows list's starting width; the user can drag it between 260 and 440. */
export const SHOWS_LIST_DEFAULT_PX = 320;

/**
 * Width inside the split that is neither the list nor the cockpit: the 12px drag handle and the
 * detail pane's 4px left padding (`MasterDetailLayout`); the show page adds no side padding of its
 * own in the pane. Measured in the browser (2026-10-15: a 1144px split, 320px list, 808px cockpit)
 * and pinned by `showsListPane.spec.ts`, which reads the real widths at 1024, 1280 and 1440.
 */
export const SHOWS_PANE_CHROME_PX = 16;

/**
 * Whether the Shows list folds away while a show is open, given the width the split has
 * (`splitWidth`, null until measured).
 *
 * The list stays beside the show only while the show, beside a list at its default width, still
 * gives the cockpit its schedule / focus split (`COCKPIT_SPLIT_MIN_WIDTH`). Narrower, the list
 * folds so the show keeps its full width, and the "Shows" button brings the list back. The rule
 * reads the space this page is given, not the window, so a wider or narrower app rail moves the
 * fold point with it. Unmeasured, it folds: the show at full width is the safe first frame.
 */
export function showsPaneFolds(splitWidth: number | null): boolean {
  if (splitWidth === null) return true;
  return splitWidth - SHOWS_LIST_DEFAULT_PX - SHOWS_PANE_CHROME_PX < COCKPIT_SPLIT_MIN_WIDTH;
}
