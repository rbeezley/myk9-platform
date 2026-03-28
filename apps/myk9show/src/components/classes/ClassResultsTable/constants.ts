/**
 * Constants for ClassResultsTable
 */

/** Reason lists for different qualification statuses */
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
