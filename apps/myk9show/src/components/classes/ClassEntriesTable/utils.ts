/**
 * Utility functions for ClassEntriesTable
 */

import { EntryData } from '../types/classTypes';
import { InlineEditData, ChangesSummary } from './types';

/**
 * Get the color classes for a status badge
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'Qualified':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'Not Qualified':
    case 'Eliminated':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'Withdrawn':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    case 'Absent':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
}

/**
 * Get the style classes for a placement display
 */
export function getPlacementStyle(placement: string): string {
  if (placement === '1') return 'text-yellow-600 font-bold';
  if (placement === '2') return 'text-gray-500 font-bold';
  if (placement === '3') return 'text-amber-600 font-bold';
  return 'text-muted-foreground';
}

/**
 * Calculate summary of pending changes
 */
export function calculateChangesSummary(
  inlineEditData: InlineEditData,
  canSubmitResults: boolean
): ChangesSummary {
  const changedEntries = Object.values(inlineEditData).filter(data => data.hasChanges);
  const validChanges = changedEntries.filter(data => data.isValid).length;
  const invalidChanges = changedEntries.filter(data => !data.isValid).length;

  return {
    total: changedEntries.length,
    valid: validChanges,
    invalid: invalidChanges,
    canSubmit: validChanges > 0 && invalidChanges === 0 && canSubmitResults
  };
}

/**
 * Generate CSV content from entries
 */
export function generateCSVContent(entries: EntryData[]): string {
  const headers = ['armband', 'handler', 'dog', 'time', 'status', 'score', 'placement'];
  const rows = entries.map(entry => [
    entry.armband,
    `"${entry.handler}"`,
    `"${entry.dog}"`,
    entry.time || '',
    entry.status || '',
    entry.score || '',
    entry.placement || ''
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Download entries as CSV file
 */
export function downloadEntriesAsCSV(entries: EntryData[]): void {
  const csvContent = generateCSVContent(entries);
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `class-entries-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse time string into components
 */
export function parseTimeString(time: string): { minutes: string; seconds: string; hundredths: string } {
  const match = time.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  return {
    minutes: match?.[1] || '',
    seconds: match?.[2] || '',
    hundredths: match?.[3] || ''
  };
}

/**
 * Format time components into standard format
 */
export function formatTimeComponents(
  minutes: string,
  seconds: string,
  hundredths: string
): string {
  if (!minutes || !seconds || !hundredths) return '';
  return `${minutes.padStart(1, '0')}:${seconds.padStart(2, '0')}.${hundredths.padStart(2, '0')}`;
}
