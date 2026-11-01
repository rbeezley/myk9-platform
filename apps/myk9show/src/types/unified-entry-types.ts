/**
 * Unified Entry Types for Table Display
 * The row shape the results table and scoring mappers share.
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
    'Qualified' | 'Not Qualified' | 'Absent' | 'Withdrawn' | 'Excused' | 'Pending' | 'Eliminated';
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
  hasChanges?: boolean | undefined; // Whether entry has unsaved changes
  isValid?: boolean | undefined; // Whether entry data is valid
}
