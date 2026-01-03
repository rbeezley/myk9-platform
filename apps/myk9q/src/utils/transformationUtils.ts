/**
 * Transformation Utilities
 *
 * Functions for converting between different data representations,
 * such as user-facing text to database enum values.
 */

/**
 * Valid result status values for database storage
 */
export type ResultStatus = 'pending' | 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn';

/**
 * Convert result text (user-facing) to result status (database enum)
 *
 * Handles both full text and abbreviated forms:
 * - "Qualified" or "Q" → "qualified"
 * - "Not Qualified" or "NQ" → "nq"
 * - "Absent" or "ABS" → "absent"
 * - "Excused" or "EX" → "excused"
 * - "Withdrawn" or "WD" → "withdrawn"
 * - Everything else → "pending"
 *
 * @param resultText - User-facing result text (full or abbreviated)
 * @returns Database-compatible result status enum value
 *
 * @example
 * convertResultTextToStatus('Qualified') // 'qualified'
 * convertResultTextToStatus('Q')         // 'qualified'
 * convertResultTextToStatus('NQ')        // 'nq'
 * convertResultTextToStatus('invalid')   // 'pending'
 */
export function convertResultTextToStatus(resultText: string): ResultStatus {
  // Normalize to handle case variations
  const normalized = resultText?.trim();

  if (normalized === 'Qualified' || normalized === 'Q') {
    return 'qualified';
  }

  if (normalized === 'Not Qualified' || normalized === 'NQ') {
    return 'nq';
  }

  if (normalized === 'Absent' || normalized === 'ABS') {
    return 'absent';
  }

  if (normalized === 'Excused' || normalized === 'EX') {
    return 'excused';
  }

  if (normalized === 'Withdrawn' || normalized === 'WD') {
    return 'withdrawn';
  }

  // Default fallback for invalid/unknown values
  return 'pending';
}
