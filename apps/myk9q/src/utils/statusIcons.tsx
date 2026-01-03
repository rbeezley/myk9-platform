/**
 * Status Icon Utilities
 *
 * Provides functions to get React icon components based on status values.
 * Uses statusConfig.ts as the single source of truth.
 */

/* eslint-disable react-refresh/only-export-components -- This is a utility file, not a component */

import React from 'react';
import {
  Circle,
  Check,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
  Settings,
  Users,
  Coffee,
  Clock,
  Play
} from 'lucide-react';
import { CHECKIN_STATUS, CLASS_STATUS, RESULT_STATUS, getCheckinStatus, getClassStatus } from '@/constants/statusConfig';

/**
 * Map of icon names to Lucide React components
 */
const ICON_MAP = {
  Circle,
  Check,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
  Settings,
  Users,
  Coffee,
  Clock,
  Play
} as const;

type IconName = keyof typeof ICON_MAP;

/**
 * Get icon component for check-in status
 */
export function getCheckinStatusIcon(
  status: string,
  props?: React.ComponentProps<typeof Circle>
): React.ReactElement | null {
  const config = getCheckinStatus(status);
  if (!config) return null;

  const IconComponent = ICON_MAP[config.icon as IconName];
  if (!IconComponent) return null;

  return <IconComponent {...props} />;
}

/**
 * Get icon component for class status
 */
export function getClassStatusIcon(
  status: string,
  props?: React.ComponentProps<typeof Circle>
): React.ReactElement | null {
  const config = getClassStatus(status);
  if (!config) return null;

  const IconComponent = ICON_MAP[config.icon as IconName];
  if (!IconComponent) return null;

  return <IconComponent {...props} />;
}

/**
 * Get icon name string for check-in status (for backward compatibility)
 */
export function getCheckinStatusIconName(status: string): string {
  const config = getCheckinStatus(status);
  return config?.icon || 'Circle';
}

/**
 * Get icon name string for class status (for backward compatibility)
 */
export function getClassStatusIconName(status: string): string {
  const config = getClassStatus(status);
  return config?.icon || 'Circle';
}

/**
 * Get status label
 */
export function getCheckinStatusLabel(status: string): string {
  const config = getCheckinStatus(status);
  return config?.label || 'Unknown';
}

export function getClassStatusLabel(status: string): string {
  const config = getClassStatus(status);
  return config?.label || 'Unknown';
}

/**
 * Get CSS variable names for status colors
 */
export function getCheckinStatusColorVar(status: string): string {
  const config = getCheckinStatus(status);
  return config?.colorVar || '--checkin-none';
}

export function getCheckinStatusTextColorVar(status: string): string {
  const config = getCheckinStatus(status);
  return config?.textColorVar || '--checkin-none-text';
}

export function getClassStatusColorVar(status: string): string {
  const config = getClassStatus(status);
  return config?.colorVar || '--status-setup';
}

export function getClassStatusTextColorVar(status: string): string {
  const config = getClassStatus(status);
  return config?.textColorVar || '--status-setup-text';
}

export function getResultStatusColorVar(status: string): string {
  const config = RESULT_STATUS[Object.keys(RESULT_STATUS).find(
    key => RESULT_STATUS[key as keyof typeof RESULT_STATUS].value === status
  ) as keyof typeof RESULT_STATUS];
  return config?.colorVar || '--status-qualified';
}

export function getResultStatusTextColorVar(status: string): string {
  const config = RESULT_STATUS[Object.keys(RESULT_STATUS).find(
    key => RESULT_STATUS[key as keyof typeof RESULT_STATUS].value === status
  ) as keyof typeof RESULT_STATUS];
  return config?.textColorVar || '--status-qualified-text';
}

/**
 * Export all check-in status values for use in components
 */
export const CHECKIN_STATUS_VALUES = Object.values(CHECKIN_STATUS).map(s => s.value);
export const CLASS_STATUS_VALUES = Object.values(CLASS_STATUS).map(s => s.value);
