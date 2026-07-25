/**
 * Check-in status types and configuration for entry status management.
 *
 * Single source of truth for the check-in state machine used by myK9Show.
 * UI-free: presentation belongs to @myk9/ui's shared status grammar.
 *
 * State machine:
 *   no-status → checked-in → at-gate / come-to-gate → in-ring → completed
 *        ↑                                                  ↓
 *        └──────────────── reset ───────────────────────────┘
 *   Also: no-status → conflict, no-status → pulled
 */

// ============================================================================
// Check-In Status Type
// ============================================================================

/** Check-in / competition flow status for an entry on show day. */
export type CheckInStatus =
  | 'no-status'
  | 'checked-in'
  | 'at-gate'
  | 'come-to-gate'
  | 'conflict'
  | 'pulled'
  | 'in-ring'
  | 'completed';

/**
 * Backward-compatible alias — myK9Q uses `EntryStatus` for the same concept.
 * New code should prefer `CheckInStatus`.
 */
export type EntryStatus = CheckInStatus;

export const CHECKIN_STATUSES: readonly CheckInStatus[] = [
  'no-status',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'conflict',
  'pulled',
  'in-ring',
  'completed',
] as const;

/**
 * @deprecated Use CHECKIN_STATUSES instead.
 */
export const ENTRY_STATUSES: readonly CheckInStatus[] = CHECKIN_STATUSES;

// ============================================================================
// Exhibitor-Allowed Statuses
// ============================================================================

/** Statuses an exhibitor can set via self-check-in */
export const EXHIBITOR_ALLOWED_STATUSES: readonly CheckInStatus[] = [
  'checked-in',
  'conflict',
  'pulled',
  'at-gate',
  'no-status',
] as const;

/** Statuses that are system/secretary-only (read-only for exhibitors) */
export const SECRETARY_ONLY_STATUSES: readonly CheckInStatus[] = [
  'come-to-gate',
  'in-ring',
  'completed',
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/** Type guard for CheckInStatus */
export function isCheckInStatus(value: string): value is CheckInStatus {
  return CHECKIN_STATUSES.includes(value as CheckInStatus);
}

/**
 * @deprecated Use isCheckInStatus instead.
 */
export const isEntryStatus = isCheckInStatus;

/** Whether this status can be set by an exhibitor via self-check-in */
export function isExhibitorAllowedStatus(status: CheckInStatus): boolean {
  return (EXHIBITOR_ALLOWED_STATUSES as readonly string[]).includes(status);
}
