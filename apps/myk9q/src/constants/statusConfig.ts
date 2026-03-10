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
    description: 'Class is being set up',
  },
  BRIEFING: {
    value: 'briefing',
    label: 'Briefing',
    colorVar: '--status-briefing',
    textColorVar: '--status-briefing-text',
    icon: 'Users',
    description: 'Judge briefing exhibitors',
  },
  BREAK: {
    value: 'break',
    label: 'Break',
    colorVar: '--status-break',
    textColorVar: '--status-break-text',
    icon: 'Coffee',
    description: 'Class on break',
  },
  START_TIME: {
    value: 'start-time',
    label: 'Start Time',
    colorVar: '--status-start-time',
    textColorVar: '--status-start-time-text',
    icon: 'Clock',
    description: 'Class scheduled to start',
  },
  IN_PROGRESS: {
    value: 'in-progress',
    label: 'In Progress',
    colorVar: '--status-in-progress',
    textColorVar: '--status-in-progress-text',
    icon: 'Play',
    description: 'Class actively running',
  },
  OFFLINE_SCORING: {
    value: 'offline-scoring',
    label: 'Offline Scoring',
    colorVar: '--status-offline-scoring',
    textColorVar: '--status-offline-scoring-text',
    icon: 'WifiOff',
    description: 'Class is being judged offline - run order updates delayed',
  },
  COMPLETED: {
    value: 'completed',
    label: 'Completed',
    colorVar: '--status-completed',
    textColorVar: '--status-completed-text',
    icon: 'CheckCircle',
    description: 'Class finished',
  },
} as const;

// ============================================================================
// CHECK-IN STATUS — canonical definition in @myk9/core
// ============================================================================

import { CHECKIN_STATUS, type EntryStatus, type CheckInStatusConfig } from '@myk9/core';
export { CHECKIN_STATUS, type EntryStatus, type CheckInStatusConfig };

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
    description: 'Qualified run',
  },
  NOT_QUALIFIED: {
    value: 'not-qualified',
    label: 'Not Qualified',
    shortLabel: 'NQ',
    colorVar: '--status-not-qualified',
    textColorVar: '--status-not-qualified-text',
    description: 'Did not qualify',
  },
  EXCUSED: {
    value: 'excused',
    label: 'Excused',
    shortLabel: 'EX',
    colorVar: '--status-excused',
    textColorVar: '--status-excused-text',
    description: 'Excused by judge',
  },
  ABSENT: {
    value: 'absent',
    label: 'Absent',
    shortLabel: 'ABS',
    colorVar: '--token-result-absent',
    textColorVar: '#ffffff',
    description: 'Did not show up',
  },
  WITHDRAWN: {
    value: 'withdrawn',
    label: 'Withdrawn',
    shortLabel: 'WD',
    colorVar: '--token-result-withdrawn',
    textColorVar: '#ffffff',
    description: 'Withdrawn by handler',
  },
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
export type ClassStatusValue = (typeof CLASS_STATUS)[keyof typeof CLASS_STATUS]['value'];
export type CheckinStatusValue = (typeof CHECKIN_STATUS)[keyof typeof CHECKIN_STATUS]['value'];
export type ResultStatusValue = (typeof RESULT_STATUS)[keyof typeof RESULT_STATUS]['value'];
