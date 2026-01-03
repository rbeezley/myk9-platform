/**
 * Single Source of Truth for Status Colors and Icons
 *
 * This file defines all status types, their colors (CSS variable references),
 * icons (Lucide React icon names), and labels used throughout the application.
 *
 * IMPORTANT: Always import from this file instead of hardcoding colors or icons.
 */

// ============================================================================
// CLASS STATUS (Trial/Class Progress)
// ============================================================================

export const CLASS_STATUS = {
  SETUP: {
    value: 'setup',
    label: 'Setup',
    colorVar: '--status-setup',
    textColorVar: '--status-setup-text',
    icon: 'Settings',
    description: 'Class is being set up'
  },
  BRIEFING: {
    value: 'briefing',
    label: 'Briefing',
    colorVar: '--status-briefing',
    textColorVar: '--status-briefing-text',
    icon: 'Users',
    description: 'Judge briefing exhibitors'
  },
  BREAK: {
    value: 'break',
    label: 'Break',
    colorVar: '--status-break',
    textColorVar: '--status-break-text',
    icon: 'Coffee',
    description: 'Class on break'
  },
  START_TIME: {
    value: 'start-time',
    label: 'Start Time',
    colorVar: '--status-start-time',
    textColorVar: '--status-start-time-text',
    icon: 'Clock',
    description: 'Class scheduled to start'
  },
  IN_PROGRESS: {
    value: 'in-progress',
    label: 'In Progress',
    colorVar: '--status-in-progress',
    textColorVar: '--status-in-progress-text',
    icon: 'Play',
    description: 'Class actively running'
  },
  OFFLINE_SCORING: {
    value: 'offline-scoring',
    label: 'Offline Scoring',
    colorVar: '--status-offline-scoring',
    textColorVar: '--status-offline-scoring-text',
    icon: 'WifiOff',
    description: 'Class is being judged offline - run order updates delayed'
  },
  COMPLETED: {
    value: 'completed',
    label: 'Completed',
    colorVar: '--status-completed',
    textColorVar: '--status-completed-text',
    icon: 'CheckCircle',
    description: 'Class finished'
  }
} as const;

// ============================================================================
// CHECK-IN STATUS (Individual Entry Status)
// ============================================================================

export const CHECKIN_STATUS = {
  NO_STATUS: {
    value: 'no-status',
    label: 'No Status',
    colorVar: '--checkin-none',
    textColorVar: '--checkin-none-text',
    icon: 'Circle',
    description: 'Dog has not checked in yet'
  },
  CHECKED_IN: {
    value: 'checked-in',
    label: 'Checked-in',
    colorVar: '--checkin-checked-in',
    textColorVar: '--checkin-checked-in-text',
    icon: 'Check',
    description: 'Dog is ready to compete'
  },
  CONFLICT: {
    value: 'conflict',
    label: 'Conflict',
    colorVar: '--checkin-conflict',
    textColorVar: '--checkin-conflict-text',
    icon: 'AlertTriangle',
    description: 'Dog entered in multiple classes'
  },
  PULLED: {
    value: 'pulled',
    label: 'Pulled',
    colorVar: '--checkin-pulled',
    textColorVar: '--checkin-pulled-text',
    icon: 'XCircle',
    description: 'Dog has been withdrawn from class'
  },
  AT_GATE: {
    value: 'at-gate',
    label: 'At Gate',
    colorVar: '--checkin-at-gate',
    textColorVar: '--checkin-at-gate-text',
    icon: 'Star',
    description: 'Dog is waiting at the ring entrance'
  },
  COME_TO_GATE: {
    value: 'come-to-gate',
    label: 'Come to Gate',
    colorVar: '--checkin-at-gate', // Same color as at-gate (purple)
    textColorVar: '--checkin-at-gate-text',
    icon: 'Bell',
    description: 'Gate steward calling exhibitor'
  },
  IN_RING: {
    value: 'in-ring',
    label: 'In Ring',
    colorVar: '--checkin-in-ring',
    textColorVar: '--checkin-in-ring-text',
    icon: 'Target',
    description: 'Dog is currently competing in the ring'
  },
  COMPLETED: {
    value: 'completed',
    label: 'Completed',
    colorVar: '--status-completed',
    textColorVar: '--status-completed-text',
    icon: 'CheckCircle',
    description: 'Dog has finished competing (no score)'
  }
} as const;

// ============================================================================
// RESULT STATUS (Scoring Results)
// ============================================================================

export const RESULT_STATUS = {
  QUALIFIED: {
    value: 'qualified',
    label: 'Qualified',
    shortLabel: 'Q',
    colorVar: '--status-qualified',
    textColorVar: '--status-qualified-text',
    description: 'Qualified run'
  },
  NOT_QUALIFIED: {
    value: 'not-qualified',
    label: 'Not Qualified',
    shortLabel: 'NQ',
    colorVar: '--status-not-qualified',
    textColorVar: '--status-not-qualified-text',
    description: 'Did not qualify'
  },
  EXCUSED: {
    value: 'excused',
    label: 'Excused',
    shortLabel: 'EX',
    colorVar: '--status-excused',
    textColorVar: '--status-excused-text',
    description: 'Excused by judge'
  },
  ABSENT: {
    value: 'absent',
    label: 'Absent',
    shortLabel: 'ABS',
    colorVar: '--token-result-absent',
    textColorVar: '#ffffff',
    description: 'Did not show up'
  },
  WITHDRAWN: {
    value: 'withdrawn',
    label: 'Withdrawn',
    shortLabel: 'WD',
    colorVar: '--token-result-withdrawn',
    textColorVar: '#ffffff',
    description: 'Withdrawn by handler'
  }
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status config by value
 */
export function getClassStatus(value: string) {
  return Object.values(CLASS_STATUS).find(s => s.value === value);
}

export function getCheckinStatus(value: string) {
  return Object.values(CHECKIN_STATUS).find(s => s.value === value);
}

export function getResultStatus(value: string) {
  return Object.values(RESULT_STATUS).find(s => s.value === value);
}

/**
 * Type-safe status values
 */
export type ClassStatusValue = typeof CLASS_STATUS[keyof typeof CLASS_STATUS]['value'];
export type CheckinStatusValue = typeof CHECKIN_STATUS[keyof typeof CHECKIN_STATUS]['value'];
export type ResultStatusValue = typeof RESULT_STATUS[keyof typeof RESULT_STATUS]['value'];
