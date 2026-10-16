/**
 * The cockpit's schedule / focused-class split, decided from the width the cockpit is given rather
 * than the window, so the same rule holds full page and inside the Shows list pane
 * (docs/plan-sidebar-browse-pane.md, phase 2 follow-up).
 *
 * The split is a two-column grid: the schedule takes `SCHEDULE_FR` of the free width, the focused
 * class `FOCUS_FR`, with `SPLIT_GAP_PX` between them. The focused class needs `FOCUS_MIN_PX` to show
 * its facts and actions without wrapping, so the cockpit splits only once its fractional share
 * alone reaches that (`COCKPIT_SPLIT_MIN_WIDTH`) and stacks below it.
 */
const SCHEDULE_FR = 1.15;
const FOCUS_FR = 0.85;
export const SPLIT_GAP_PX = 20;
export const FOCUS_MIN_PX = 360;

/** The two-column template, written once so the grid and the arithmetic below agree. */
export const COCKPIT_SPLIT_COLUMNS = `minmax(0, ${SCHEDULE_FR}fr) minmax(${FOCUS_MIN_PX}px, ${FOCUS_FR}fr)`;

/** Column widths the split grid lays out at `containerWidth` (CSS grid's fr rules for this template). */
export function cockpitSplitColumns(containerWidth: number): { schedule: number; focus: number } {
  const free = Math.max(0, containerWidth - SPLIT_GAP_PX);
  const focus = Math.max(FOCUS_MIN_PX, (free * FOCUS_FR) / (SCHEDULE_FR + FOCUS_FR));
  return { schedule: Math.max(0, free - focus), focus };
}

/** The narrowest cockpit, in CSS px, whose focused-class column gets at least `FOCUS_MIN_PX`. */
export const COCKPIT_SPLIT_MIN_WIDTH = Math.ceil(
  (FOCUS_MIN_PX * (SCHEDULE_FR + FOCUS_FR)) / FOCUS_FR + SPLIT_GAP_PX
);

/** Unmeasured (first render, no layout) reads as stacked: the layout that fits any width. */
export function isCockpitSplit(containerWidth: number | null): boolean {
  return containerWidth !== null && containerWidth >= COCKPIT_SPLIT_MIN_WIDTH;
}
