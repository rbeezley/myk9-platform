/**
 * Check-in status types and configuration for entry status management.
 *
 * Single source of truth for the check-in state machine used by both
 * myK9Show and myK9Q. UI-free — contains only types, labels, colors, and
 * icon names (as strings). Each app resolves icon names to components.
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
// Status Configuration
// ============================================================================

export interface CheckInStatusConfig {
  readonly value: CheckInStatus;
  readonly label: string;
  readonly icon: string;
  readonly colorVar: string;
  readonly textColorVar: string;
  readonly description: string;
}

export const CHECKIN_STATUS: Record<string, CheckInStatusConfig> = {
  NO_STATUS: {
    value: 'no-status',
    label: 'No Status',
    icon: 'Circle',
    colorVar: '--checkin-none',
    textColorVar: '--checkin-none-text',
    description: 'Dog has not checked in yet',
  },
  CHECKED_IN: {
    value: 'checked-in',
    label: 'Checked-in',
    icon: 'Check',
    colorVar: '--checkin-checked-in',
    textColorVar: '--checkin-checked-in-text',
    description: 'Dog is ready to compete',
  },
  CONFLICT: {
    value: 'conflict',
    label: 'Conflict',
    icon: 'AlertTriangle',
    colorVar: '--checkin-conflict',
    textColorVar: '--checkin-conflict-text',
    description: 'Dog entered in multiple classes',
  },
  PULLED: {
    value: 'pulled',
    label: 'Pulled',
    icon: 'XCircle',
    colorVar: '--checkin-pulled',
    textColorVar: '--checkin-pulled-text',
    description: 'Dog has been withdrawn from class',
  },
  AT_GATE: {
    value: 'at-gate',
    label: 'At Gate',
    icon: 'Star',
    colorVar: '--checkin-at-gate',
    textColorVar: '--checkin-at-gate-text',
    description: 'Dog is waiting at the ring entrance',
  },
  COME_TO_GATE: {
    value: 'come-to-gate',
    label: 'Come to Gate',
    icon: 'Bell',
    colorVar: '--checkin-at-gate',
    textColorVar: '--checkin-at-gate-text',
    description: 'Gate steward calling exhibitor',
  },
  IN_RING: {
    value: 'in-ring',
    label: 'In Ring',
    icon: 'Target',
    colorVar: '--checkin-in-ring',
    textColorVar: '--checkin-in-ring-text',
    description: 'Dog is currently competing in the ring',
  },
  COMPLETED: {
    value: 'completed',
    label: 'Completed',
    icon: 'CheckCircle',
    colorVar: '--status-completed',
    textColorVar: '--status-completed-text',
    description: 'Dog has finished competing',
  },
} as const;

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

/** Pre-built lookup map for O(1) config access by status value */
const CONFIG_BY_VALUE = new Map<string, CheckInStatusConfig>(
  Object.values(CHECKIN_STATUS).map(s => [s.value, s])
);

/** Look up status config by value */
export function getCheckinStatusConfig(value: string): CheckInStatusConfig | undefined {
  return CONFIG_BY_VALUE.get(value);
}

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
