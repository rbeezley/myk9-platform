/**
 * Unified Entry Types for Table Display
 * These types ensure consistent data structure between ClassEntriesTable and BulkResultEntry
 */

import { TrialType } from './template.types';

export interface UnifiedEntryData {
  // Core identity
  id: string;
  classId: string;

  // Registration data
  armband: string;
  handler: string;
  dog: string;
  dogId?: string | undefined;
  handlerId?: string | undefined;

  // Competition results
  status:
    | 'Qualified'
    | 'Not Qualified'
    | 'Absent'
    | 'Withdrawn'
    | 'Excused'
    | 'Pending'
    | 'Eliminated';
  time?: string | undefined; // Formatted time string (MM:SS.HH or MM:SS)
  score?: string | undefined; // Score as string (could be points, percentage, etc.)
  faults?: number | undefined;
  placement?: string | undefined;
  qualification?: string | undefined; // More specific than status (can be same as status or more detailed)
  notes?: string | undefined;

  // Metadata
  trialType?: TrialType | undefined;
  updatedAt?: string | undefined;
  recordedBy?: string | undefined;

  // Raw data for advanced use cases
  rawTimeMs?: number | undefined; // Time in milliseconds for calculations
  rawScore?: number | undefined; // Numeric score for calculations

  // Display hints
  isProvisional?: boolean | undefined; // Whether results are provisional
  hasChanges?: boolean | undefined; // Whether entry has unsaved changes (for BulkResultEntry)
  isValid?: boolean | undefined; // Whether entry data is valid (for BulkResultEntry)
}

/**
 * Transform ShowEntry to UnifiedEntryData
 */
export function transformShowEntryToUnified(
  entry: unknown, // ShowEntry type - keeping as unknown for now to access properties
  dogs: unknown[], // Dog array - keeping as unknown for now to access properties
  trialType?: TrialType
): UnifiedEntryData {
  const entryData = entry as Record<string, unknown>;
  const dogsData = dogs as Record<string, unknown>[];
  const dog = dogsData.find(d => d.id === entryData.dogId) as Record<string, unknown> | undefined;
  const registrationData = (entryData.registrationData || {}) as Record<string, unknown>;
  const competitionData = (entryData.competitionData || {}) as Record<string, unknown>;

  // Determine status from competition data
  let status: UnifiedEntryData['status'] = 'Pending';
  if (competitionData.qualification) {
    status = competitionData.qualification as UnifiedEntryData['status'];
  } else if (competitionData.qualified !== undefined) {
    status = competitionData.qualified ? 'Qualified' : 'Not Qualified';
  }

  return {
    id: entryData.id as string,
    classId: entryData.classId as string,
    armband: (registrationData.armband as string) || '',
    handler: (registrationData.handler as string) || '',
    dog: (dog?.callName as string) || (dog?.name as string) || 'Unknown Dog',
    dogId: entryData.dogId as string,
    handlerId: registrationData.handlerId as string,
    status,
    time: (competitionData.time as string) || '',
    score: (competitionData.score as string) || '',
    faults: (competitionData.faults as number) || 0,
    placement: (competitionData.placement as string) || '',
    qualification: (competitionData.qualification as string) || '',
    notes: (competitionData.judgeNotes as string) || '',
    trialType,
    updatedAt: entryData.updatedAt as string,
    recordedBy: competitionData.recordedBy as string,
    rawTimeMs: competitionData.time ? parseTimeToMs(competitionData.time as string) : undefined,
    rawScore: competitionData.score ? parseFloat(competitionData.score as string) : undefined,
    isProvisional: true, // Most entries start as provisional
  };
}

/**
 * Transform ScentWorkEntry to UnifiedEntryData (for BulkResultEntry compatibility)
 */
export function transformScentWorkEntryToUnified(
  entry: unknown, // ScentWorkEntry type - keeping as unknown for now to access properties
  trialType?: TrialType
): UnifiedEntryData {
  const entryData = entry as Record<string, unknown>;
  const displayInfo = (entryData.displayInfo || {}) as Record<string, unknown>;
  const judgingState = (entryData.judgingState || {}) as Record<string, unknown>;
  const currentResult = (judgingState.currentResult || {}) as Record<string, unknown>;
  const competitionData = (entryData.competitionData || {}) as Record<string, unknown>;

  // Prioritize saved competition data over judging state
  const time =
    (competitionData.time as string) ||
    (currentResult.searchTime ? formatMsToTime(currentResult.searchTime as number) : '');
  const qualification =
    (competitionData.qualification as string) || (currentResult.qualification as string) || '';

  return {
    id: entryData.id as string,
    classId: (entryData.classId as string) || '',
    armband: (displayInfo.armband as string) || '',
    handler: (displayInfo.handlerName as string) || '',
    dog: (displayInfo.dogName as string) || '',
    dogId: displayInfo.dogId as string,
    handlerId: displayInfo.handlerId as string,
    status: (qualification as UnifiedEntryData['status']) || 'Pending',
    time,
    score: (competitionData.score as string) || '',
    faults: (competitionData.faults as number) || (currentResult.faults as number) || 0,
    placement: (competitionData.placement as string) || '',
    qualification,
    notes: (competitionData.judgeNotes as string) || (currentResult.judgeNotes as string) || '',
    trialType: trialType || TrialType.SCENT_WORK,
    updatedAt: entryData.updatedAt as string,
    recordedBy: (competitionData.recordedBy as string) || (currentResult.recordedBy as string),
    rawTimeMs: (currentResult.searchTime as number) || (time ? parseTimeToMs(time) : undefined),
    rawScore: competitionData.score ? parseFloat(competitionData.score as string) : undefined,
    isProvisional: true,
  };
}

/**
 * Transform UnifiedEntryData back to the format expected by BulkResultEntry
 */
export function transformUnifiedToBulkEntryData(entry: UnifiedEntryData): Record<string, unknown> {
  return {
    entryId: entry.id,
    armband: entry.armband,
    dogName: entry.dog,
    handlerName: entry.handler,
    searchTime: entry.time || '',
    qualification: entry.qualification || entry.status,
    faults: entry.faults?.toString() || '0',
    notes: entry.notes || '',
    isValid: !!(entry.time && entry.qualification),
    hasChanges: entry.hasChanges || false,
  };
}

/**
 * Parse time string (MM:SS.HH or MM:SS) to milliseconds
 */
function parseTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;

  // Handle MM:SS.HH format
  const hhMatch = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (hhMatch) {
    const minutes = parseInt(hhMatch[1]);
    const seconds = parseInt(hhMatch[2]);
    const hundredths = parseInt(hhMatch[3]);
    return (minutes * 60 + seconds) * 1000 + hundredths * 10;
  }

  // Handle MM:SS format
  const ssMatch = timeStr.match(/^(\d{1,2}):([0-5]\d)$/);
  if (ssMatch) {
    const minutes = parseInt(ssMatch[1]);
    const seconds = parseInt(ssMatch[2]);
    return (minutes * 60 + seconds) * 1000;
  }

  return 0;
}

/**
 * Format milliseconds to time string (MM:SS.HH)
 */
function formatMsToTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.round((totalSeconds % 1) * 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Get entry status color class
 */
export function getEntryStatusColor(status: UnifiedEntryData['status']): string {
  switch (status) {
    case 'Qualified':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    case 'Not Qualified':
    case 'Eliminated':
      return 'bg-destructive/10 text-destructive ';
    case 'Absent':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'Withdrawn':
    case 'Excused':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    case 'Pending':
    default:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
}
