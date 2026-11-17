/**
 * Constants for ClassResultsTable
 */

/**
 * Short display codes for each qualification status.
 *
 * Keyed by every QualificationStatus union member (including the display-only
 * 'Eliminated'). Consumers fall back to the raw status via `|| status`, but a
 * missing entry would leak the long status string into a narrow table cell —
 * see qualification-display-labels.test.ts, which pins full union coverage.
 */
export const DISPLAY_LABELS: Record<string, string> = {
  Qualified: 'Q',
  'Not Qualified': 'NQ',
  Absent: 'ABS',
  Excused: 'EXC',
  Disqualified: 'DQ',
  Withdrawn: 'WD',
  Eliminated: 'E',
};
