/**
 * Scoring Mappers
 *
 * Converts between database entry/class records and scoring-specific types
 * (ScentWorkEntry, ScentWorkResult, UnifiedEntryData).
 */

import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  ScentWorkResult,
  QualificationStatus,
} from '@/types/scent-work-types';
import { IN_RING_STATUSES, type EntryStatus } from '@/types/entry-lifecycle';
import type { CheckInStatus } from '@myk9/core';
import type { UnifiedEntryData } from '@/types/unified-entry-types';
import { getTimeLimit, isMultiAreaClass, getAreaTimeLimits } from '@/types/scent-work-types';

// ============================================================================
// DB Row Shapes (from Supabase query results)
// ============================================================================

/** Shape returned by getEntriesByClass — entry row with dog relation */
export interface DbEntryWithDog {
  id: string;
  class_id: string | null;
  show_id: string | null;
  dog_id: string | null;
  handler: string | null;
  handler_id: string | null;
  armband: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  payment_status: string | null;
  run_order: number | null;
  special_requests: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  check_in_status: string | null;
  result_status: string | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  judge_notes: string | null;
  is_scored: boolean | null;
  is_in_ring: boolean | null;
  scoring_started_at: string | null;
  scoring_completed_at: string | null;
  disqualification_reason: string | null;
  dog?: {
    id: string;
    name: string;
    call_name?: string | null;
    breed?: string | null;
    owner?: {
      id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
    } | null;
  } | null;
  [key: string]: unknown;
}

/** Minimal class fields needed for scoring config */
export interface DbClassForScoring {
  id: string;
  name: string;
  class_number: string | null;
  element: string | null;
  level: string | null;
  time_limit_seconds: number | null;
  num_areas: number | null;
  num_hides: number | null;
}

// ============================================================================
// Class → ScentWorkClassConfig
// ============================================================================

export function mapDbClassToScentWorkConfig(dbClass: DbClassForScoring): ScentWorkClassConfig {
  const element = (dbClass.element || 'Container') as ScentWorkClassConfig['element'];
  const level = (dbClass.level || 'Novice') as ScentWorkClassConfig['level'];
  const timeLimit = dbClass.time_limit_seconds
    ? dbClass.time_limit_seconds * 1000
    : getTimeLimit(element, level);
  const multiArea = isMultiAreaClass(element, level);
  const areaLimits = multiArea ? getAreaTimeLimits(element, level) : undefined;

  return {
    element,
    level,
    timeLimit,
    multiArea: multiArea || undefined,
    areaLimits,
    warningsEnabled: level !== 'Masters',
    hideCount: dbClass.num_hides ?? undefined,
  };
}

// ============================================================================
// DB Entry → ScentWorkEntry
// ============================================================================

export function mapDbEntryToScentWorkEntry(
  dbEntry: DbEntryWithDog,
  classConfig: ScentWorkClassConfig
): ScentWorkEntry {
  const dog = dbEntry.dog;
  const ownerName = dog?.owner ? `${dog.owner.first_name} ${dog.owner.last_name}`.trim() : '';

  return {
    id: dbEntry.id,
    showId: dbEntry.show_id || '',
    classId: dbEntry.class_id || '',
    dogId: dbEntry.dog_id || '',
    status: mapEntryStatus(dbEntry.entry_status),
    registrationData: {
      submittedAt: dbEntry.submitted_at ? new Date(dbEntry.submitted_at) : new Date(),
      handler: dbEntry.handler || ownerName || '',
      handlerId: dbEntry.handler_id || undefined,
      entryFee: dbEntry.entry_fee || 0,
      paymentStatus: (dbEntry.payment_status as 'pending' | 'paid' | 'refunded') || 'pending',
      specialRequests: dbEntry.special_requests || undefined,
      armband: dbEntry.armband || undefined,
      runOrder: dbEntry.run_order || undefined,
    },
    statusHistory: [],
    classConfig,
    displayInfo: {
      armband: dbEntry.armband || '',
      dogName: dog?.call_name || dog?.name || 'Unknown Dog',
      dogBreed: dog?.breed || '',
      handlerName: dbEntry.handler || ownerName || '',
      dogId: dbEntry.dog_id || '',
      handlerId: dbEntry.handler_id || '',
    },
    judgingState:
      dbEntry.scoring_started_at && !dbEntry.scoring_completed_at
        ? { timerStarted: new Date(dbEntry.scoring_started_at), isInProgress: true }
        : undefined,
    checkInStatus: mapCheckInStatus(dbEntry.check_in_status),
  };
}

// ============================================================================
// Extract ScentWorkResult from a scored DB entry
// ============================================================================

export function extractScentWorkResult(
  dbEntry: DbEntryWithDog,
  maxTimeAllowed: number
): ScentWorkResult | undefined {
  if (!dbEntry.is_scored && dbEntry.search_time_seconds == null) return undefined;

  return {
    entryId: dbEntry.id,
    classId: dbEntry.class_id || '',
    searchTime: (dbEntry.search_time_seconds || 0) * 1000,
    maxTimeAllowed,
    qualification: mapQualification(dbEntry.result_status),
    faults: dbEntry.total_faults || 0,
    qualificationReason: dbEntry.disqualification_reason || undefined,
    judgeNotes: dbEntry.judge_notes || undefined,
    recordedBy: '',
    recordedAt: dbEntry.scoring_completed_at ? new Date(dbEntry.scoring_completed_at) : new Date(),
    isProvisional: !dbEntry.scoring_completed_at,
    placementCalculated: dbEntry.final_placement || undefined,
  };
}

// ============================================================================
// ScentWorkResult → DB entry update
// ============================================================================

export function mapScentWorkResultToDbUpdate(result: ScentWorkResult): Record<string, unknown> {
  return {
    search_time_seconds: result.searchTime / 1000,
    total_faults: result.faults,
    result_status: result.qualification,
    judge_notes: result.judgeNotes || null,
    disqualification_reason: result.qualificationReason || null,
    is_scored: true,
    scoring_completed_at:
      result.recordedAt instanceof Date
        ? result.recordedAt.toISOString()
        : new Date().toISOString(),
    final_placement: result.placementCalculated || null,
    entry_status: 'completed',
    updated_at: new Date().toISOString(),
  };
}

// ============================================================================
// DB Entry → UnifiedEntryData (for OfflineJudgeInterface)
// ============================================================================

export function mapDbEntryToUnifiedEntry(dbEntry: DbEntryWithDog): UnifiedEntryData {
  const dog = dbEntry.dog;
  const ownerName = dog?.owner ? `${dog.owner.first_name} ${dog.owner.last_name}`.trim() : '';

  return {
    id: dbEntry.id,
    classId: dbEntry.class_id || '',
    armband: dbEntry.armband || '',
    handler: dbEntry.handler || ownerName || '',
    dog: dog?.call_name || dog?.name || 'Unknown Dog',
    dogId: dbEntry.dog_id || undefined,
    handlerId: dbEntry.handler_id || undefined,
    status: dbEntry.is_scored ? mapUnifiedStatus(dbEntry.result_status) : 'Pending',
    updatedAt: dbEntry.updated_at || undefined,
    isProvisional: !dbEntry.scoring_completed_at,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapEntryStatus(dbStatus: string | null): EntryStatus {
  const valid: EntryStatus[] = [
    'draft',
    'submitted',
    'paid',
    'confirmed',
    'scheduled',
    ...IN_RING_STATUSES,
    'completed',
    'withdrawn',
    'scratched',
  ];
  return valid.includes(dbStatus as EntryStatus) ? (dbStatus as EntryStatus) : 'confirmed';
}

function mapCheckInStatus(checkInStatus: string | null): CheckInStatus {
  switch (checkInStatus) {
    case 'checked-in':
      return 'checked-in';
    case 'conflict':
      return 'conflict';
    case 'pulled':
      return 'pulled';
    case 'at-gate':
      return 'at-gate';
    case 'come-to-gate':
      return 'come-to-gate';
    default:
      return 'no-status';
  }
}

function mapQualification(resultStatus: string | null): QualificationStatus {
  switch (resultStatus) {
    case 'Qualified':
      return 'Qualified';
    case 'Not Qualified':
      return 'Not Qualified';
    case 'Absent':
      return 'Absent';
    case 'Excused':
      return 'Excused';
    case 'Withdrawn':
      return 'Withdrawn';
    case 'Eliminated':
      return 'Eliminated';
    default:
      return 'Not Qualified';
  }
}

function mapUnifiedStatus(resultStatus: string | null): UnifiedEntryData['status'] {
  switch (resultStatus) {
    case 'Qualified':
      return 'Qualified';
    case 'Not Qualified':
      return 'Not Qualified';
    case 'Absent':
      return 'Absent';
    case 'Withdrawn':
      return 'Withdrawn';
    case 'Excused':
      return 'Excused';
    case 'Eliminated':
      return 'Eliminated';
    default:
      return 'Pending';
  }
}
