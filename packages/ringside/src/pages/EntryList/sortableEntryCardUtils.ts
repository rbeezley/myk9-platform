/**
 * SortableEntryCard Utility Functions
 *
 * Pure helpers for result normalization, status display, and placement
 * formatting. Extracted from `SortableEntryCard.tsx` (DEBT-008 in
 * apps/myk9q) to reduce that component's complexity, then moved into
 * @myk9/ringside in PR E2a — pure helpers + hooks extraction.
 *
 * Host app re-exports this module via
 * apps/myk9q/src/pages/EntryList/sortableEntryCardUtils.ts as a shim so
 * existing callers (SortableEntryCard.tsx, SortableEntryCardComponents.tsx)
 * keep working unchanged.
 */

import type { Entry } from '../../stores/entryStore';

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
  | 'no-status';

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
 * Get result-border reinforcement without duplicating entry lifecycle status.
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

  return 'no-status';
}

/**
 * Get placement emoji based on position
 */
export function getPlacementEmoji(placement: number): string {
  switch (placement) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return '🎖️';
  }
}

/**
 * Get placement text (1st, 2nd, etc.)
 */
export function getPlacementText(placement: number): string {
  switch (placement) {
    case 1:
      return '1st';
    case 2:
      return '2nd';
    case 3:
      return '3rd';
    default:
      return `${placement}th`;
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
