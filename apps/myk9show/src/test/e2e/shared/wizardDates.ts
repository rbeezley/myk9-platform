/**
 * Relative calendar dates for the show-creation wizard date-range pickers.
 *
 * The wizard `DateRangePicker` opens on the current month and applies no
 * `minDate`, so any day in the current month renders as a selectable button.
 * Deriving the dates from `new Date()` keeps the secretary wizard proofs from
 * rotting into the past — earlier hardcoded `May 30th, 2026` literals broke on
 * 2026-06-02 once the calendar advanced to June and the May days fell out of the
 * default grid (QA-TEST-FLAKE-016).
 */
const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

export interface CalendarDay {
  /** Accessible-name matcher for the calendar day button, e.g. /June 10th, 2026/i */
  pick: RegExp;
  /** Rendered range text, e.g. "Jun 10, 2026" */
  display: string;
}

export interface WizardRangeDates {
  show: { start: CalendarDay; end: CalendarDay };
  entry: { start: CalendarDay; end: CalendarDay };
}

/**
 * Two distinct date ranges anchored to fixed day-of-month positions in the
 * current month. All four days (5th, 10th, 14th, 20th) exist in every month and
 * render in the picker's default grid, so the proof never depends on wall-clock.
 */
export function currentMonthWizardDates(now: Date = new Date()): WizardRangeDates {
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const full = MONTHS_FULL[monthIdx];
  const abbr = MONTHS_ABBR[monthIdx];
  const day = (d: number): CalendarDay => ({
    pick: new RegExp(`${full} ${ordinal(d)}, ${year}`, 'i'),
    display: `${abbr} ${d}, ${year}`,
  });
  return {
    show: { start: day(10), end: day(14) },
    entry: { start: day(5), end: day(20) },
  };
}
