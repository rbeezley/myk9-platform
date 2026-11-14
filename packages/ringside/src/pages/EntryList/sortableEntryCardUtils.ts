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
import { ordinal } from './ordinal';

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
  if (normalized === 'dq' || normalized === 'disqualified') return 'DQ';
  if (normalized === 'wd' || normalized === 'withdrawn') return 'WD';
  return result || 'N/A';
}

/**
 * Get result-border reinforcement without duplicating entry lifecycle status.
 */
export function getStatusBorderClass(entry: Entry): StatusBorderClass {
  if (entry.isScored) {
    const result = (entry.resultText || '').toLowerCase();
    if (result === 'q' || result === 'qualified') return 'result-qualified';
    if (result === 'nq' || result === 'non-qualifying') return 'result-nq';
    // A DQ is a non-qualifying outcome like Excused; it shares that border.
    if (result === 'ex' || result === 'excused' || result === 'dq' || result === 'disqualified') {
      return 'result-ex';
    }
    if (result === 'abs' || result === 'absent') return 'result-abs';
    if (result === 'wd' || result === 'withdrawn') return 'result-wd';
    return 'scored'; // Fallback to generic scored
  }

  return 'no-status';
}

/**
 * Get placement text (1st, 2nd, etc.)
 */
export function getPlacementText(placement: number): string {
  return ordinal(placement);
}
