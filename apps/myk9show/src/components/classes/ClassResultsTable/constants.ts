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
  Withdrawn: 'WD',
  Eliminated: 'E',
};

/**
 * Reason lists for different qualification statuses.
 *
 * Intentionally omits 'Qualified', 'Absent', and 'Eliminated':
 * - 'Qualified' is a pass; 'Absent' is a no-show — neither carries a reason.
 * - 'Eliminated' is display-only here (not offered in the editor's status Select),
 *   so it has no reason-entry path to populate.
 * Keep in sync with STATUSES_REQUIRING_REASON below.
 */
export const QUALIFICATION_REASONS = {
  'Not Qualified': [
    'Incorrect Call',
    'Max Time',
    'Unable to Point to Hide',
    'Harsh Correction',
    'Significant Disruption of Search Area',
  ],
  Excused: [
    'Dog Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Overly Stressed',
    'Other',
  ],
  Withdrawn: ['In Season', 'Judge Change'],
} as const;

/** Qualification statuses that require a reason */
export const STATUSES_REQUIRING_REASON: readonly string[] = [
  'Not Qualified',
  'Excused',
  'Withdrawn',
] as const;

/** Ordered field names used for keyboard navigation */
export const NAVIGABLE_FIELDS = [
  'qualification',
  'qualificationReason',
  'searchTime',
  'faults',
] as const;
