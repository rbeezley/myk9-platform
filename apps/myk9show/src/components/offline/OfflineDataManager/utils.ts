/**
 * Utility functions and constants for OfflineDataManager
 */

import type { EntityInfo, StorageBreakdownItem, StorageQuota } from './types';

/**
 * Format a byte count into a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Available entity types for export/backup/clear operations. */
export const AVAILABLE_ENTITIES: EntityInfo[] = [
  { id: 'shows', label: 'Shows', icon: '\u{1F3C6}', count: 25 },
  { id: 'entries', label: 'Entries', icon: '\u{1F4DD}', count: 1250 },
  { id: 'dogs', label: 'Dogs', icon: '\u{1F415}', count: 450 },
  { id: 'people', label: 'Users', icon: '\u{1F464}', count: 300 },
  { id: 'classes', label: 'Classes', icon: '\u{1F4CB}', count: 150 },
  { id: 'results', label: 'Results', icon: '\u{1F3C5}', count: 800 },
  { id: 'settings', label: 'Settings', icon: '\u{2699}\u{FE0F}', count: 1 },
];

/** Default export options for a fresh session. */
export const DEFAULT_EXPORT_OPTIONS = {
  format: 'json' as const,
  entities: ['shows', 'entries', 'dogs', 'people'],
  includeDeleted: false,
  compressed: true,
};

/** Mock storage quota for demonstration. */
export const MOCK_STORAGE_QUOTA: StorageQuota = {
  used: 52428800, // 50MB
  available: 157286400, // 150MB
  total: 209715200, // 200MB
  usagePercentage: 25,
};

/** Mock storage breakdown by entity type. */
export const STORAGE_BREAKDOWN: StorageBreakdownItem[] = [
  { entity: 'Shows', size: 5242880, percentage: 10 },
  { entity: 'Entries', size: 31457280, percentage: 60 },
  { entity: 'Dogs', size: 10485760, percentage: 20 },
  { entity: 'Results', size: 5242880, percentage: 10 },
];

/** Time offsets used for mock backup dates (in milliseconds). */
export const ONE_DAY_MS = 86400000;
export const ONE_WEEK_MS = 604800000;
