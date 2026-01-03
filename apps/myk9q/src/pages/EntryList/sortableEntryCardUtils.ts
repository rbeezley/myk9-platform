/**
 * SortableEntryCard Utility Functions
 *
 * Extracted from SortableEntryCard.tsx (DEBT-008) to reduce complexity.
 * Contains pure helper functions for result normalization and status determination.
 */

import { Entry } from '../../stores/entryStore';

// ========================================
// TYPES
// ========================================

export type StatusBorderClass =
  | 'result-qualified'
  | 'result-nq'
  | 'result-ex'
  | 'result-abs'
  | 'result-wd'
  | 'scored'
  | 'in-ring'
  | 'checked-in'
  | 'conflict'
  | 'pulled'
  | 'at-gate'
  | 'come-to-gate'
  | 'completed'
  | 'no-status';

export interface StatusConfig {
  iconName: 'circle' | 'check' | 'alert-triangle' | 'x-circle' | 'star' | 'bell' | 'target' | null;
  text: string;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Normalize result text to standard display format
 */
export function normalizeResultText(result: string | null | undefined): string {
  const normalized = (result || '').toLowerCase();
  if (normalized === 'q' || normalized === 'qualified') return 'Q';
  if (normalized === 'nq' || normalized === 'non-qualifying') return 'NQ';
  if (normalized === 'abs' || normalized === 'absent' || normalized === 'e') return 'ABS';
  if (normalized === 'ex' || normalized === 'excused') return 'EX';
  if (normalized === 'wd' || normalized === 'withdrawn') return 'WD';
  return result || 'N/A';
}

/**
 * Get the result class name for styling
 */
export function getResultClassName(result: string | null | undefined): string {
  return (result || '').toLowerCase();
}

/**
 * Check if result is non-qualifying (for placement display logic)
 */
export function isNonQualifyingResult(result: string | null | undefined): boolean {
  const resultLower = (result || '').toLowerCase();
  return (
    resultLower.includes('nq') ||
    resultLower.includes('non-qualifying') ||
    resultLower.includes('abs') ||
    resultLower.includes('absent') ||
    resultLower.includes('ex') ||
    resultLower.includes('excused') ||
    resultLower.includes('wd') ||
    resultLower.includes('withdrawn')
  );
}

/**
 * Get status border class based on entry state
 */
export function getStatusBorderClass(entry: Entry): StatusBorderClass {
  if (entry.isScored) {
    const result = (entry.resultText || '').toLowerCase();
    if (result === 'q' || result === 'qualified') return 'result-qualified';
    if (result === 'nq' || result === 'non-qualifying') return 'result-nq';
    if (result === 'ex' || result === 'excused') return 'result-ex';
    if (result === 'abs' || result === 'absent') return 'result-abs';
    if (result === 'wd' || result === 'withdrawn') return 'result-wd';
    return 'scored'; // Fallback to generic scored
  }

  if (entry.status === 'in-ring') return 'in-ring';
  if (entry.status === 'checked-in') return 'checked-in';
  if (entry.status === 'conflict') return 'conflict';
  if (entry.status === 'pulled') return 'pulled';
  if (entry.status === 'at-gate') return 'at-gate';
  if (entry.status === 'come-to-gate') return 'come-to-gate';
  if (entry.status === 'completed') return 'completed';

  return 'no-status';
}

/**
 * Get placement emoji based on position
 */
export function getPlacementEmoji(placement: number): string {
  switch (placement) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '🎖️';
  }
}

/**
 * Get placement text (1st, 2nd, etc.)
 */
export function getPlacementText(placement: number): string {
  switch (placement) {
    case 1: return '1st';
    case 2: return '2nd';
    case 3: return '3rd';
    default: return `${placement}th`;
  }
}

/**
 * Get status icon name and text configuration
 */
export function getStatusConfig(status: string | null | undefined): StatusConfig {
  const normalizedStatus = status || 'no-status';

  switch (normalizedStatus) {
    case 'in-ring':
      return { iconName: 'target', text: 'In Ring' };
    case 'completed':
      return { iconName: 'check', text: 'Completed' };
    case 'checked-in':
      return { iconName: 'check', text: 'Checked-in' };
    case 'conflict':
      return { iconName: 'alert-triangle', text: 'Conflict' };
    case 'pulled':
      return { iconName: 'x-circle', text: 'Pulled' };
    case 'at-gate':
      return { iconName: 'star', text: 'At Gate' };
    case 'come-to-gate':
      return { iconName: 'bell', text: 'Come to Gate' };
    case 'no-status':
      return { iconName: 'circle', text: 'No Status' };
    default:
      return { iconName: null, text: normalizedStatus };
  }
}

/**
 * Check if show context indicates a nationals competition
 */
export function isNationalsCompetition(
  showContext?: { competition_type?: string } | null
): boolean {
  return !!showContext?.competition_type?.toLowerCase().includes('national');
}

/**
 * Get the display time for an entry based on result status.
 * Non-qualifying results (NQ, Absent, Excused, Withdrawn) show "00:00.00"
 * Qualified results show actual time.
 */
export function getDisplayTime(
  searchTime: number | string | null | undefined,
  resultText: string | null | undefined,
  formatFn: (time: number | string | null) => string
): string {
  if (isNonQualifyingResult(resultText)) {
    return '00:00.00';
  }
  return formatFn(searchTime ?? null);
}
