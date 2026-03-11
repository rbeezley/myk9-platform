/**
 * Types for scoring pages
 *
 * Adapts myK9Show's ReplicatedEntry to work with @myk9/scoring-ui hooks.
 */

import type {
  BaseEntry,
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
} from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

/**
 * Extended entry type for scoring UI
 * Combines entry data with related dog data and result info
 */
export interface ScoringEntry extends BaseEntry {
  // Core identifiers (string IDs from database)
  entryId: string;
  classId: string;
  dogId: string;

  // Display fields
  callName: string;
  handler: string;
  breed: string;
  armband: number;

  // Status and ordering
  status: 'pending' | 'in-ring' | 'scored' | 'pulled' | 'absent';
  inRing: boolean;
  isScored: boolean;
  exhibitorOrder: number;

  // Optional scoring result
  placement?: number;
  result?: ScoringResult;

  // For combined A/B class views
  section?: 'A' | 'B';
}

/**
 * Scoring result for an entry
 */
export interface ScoringResult {
  time: number; // milliseconds
  faults: number;
  qualification: 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn';
  placement?: number;
  points?: number;
  notes?: string;
}

/**
 * Class info for the entry list header
 */
export interface ClassInfo {
  id: string;
  name: string;
  level?: string;
  element?: string;
  judge?: string;
  maxTime?: string; // "M:SS" format
  entryCount: number;
}

/**
 * Convert ReplicatedEntry + ReplicatedDog to ScoringEntry
 */
export function toScoringEntry(
  entry: ReplicatedEntry,
  dog: ReplicatedDog | null,
  index: number
): ScoringEntry {
  const armband = parseInt(entry.armband || '0', 10) || 0;
  const status = mapEntryStatus(entry.status);

  return {
    // BaseEntry required fields (id as number for hooks)
    id: parseInt(entry.id, 10) || index,

    // String IDs for database operations
    entryId: entry.id,
    classId: entry.classId || '',
    dogId: entry.dogId || '',

    // Display fields
    callName: dog?.callName || dog?.name || 'Unknown',
    handler: entry.handler || 'Unknown Handler',
    breed: dog?.breed || 'Unknown Breed',
    armband,

    // Status
    status,
    inRing: status === 'in-ring',
    isScored: status === 'scored',
    exhibitorOrder: entry.runOrder || armband || index + 1,
    // Note: section is optional and not available on ReplicatedEntry
    // It would need to be passed from class data if needed
  };
}

/**
 * Map database status to scoring status
 */
function mapEntryStatus(dbStatus?: string): ScoringEntry['status'] {
  switch (dbStatus?.toLowerCase()) {
    case 'in-ring':
    case 'inring':
    case 'in_ring':
      return 'in-ring';
    case 'scored':
    case 'completed':
      return 'scored';
    case 'pulled':
    case 'scratched':
      return 'pulled';
    case 'absent':
    case 'no-show':
      return 'absent';
    default:
      return 'pending';
  }
}

/**
 * Convert ReplicatedClass to ClassInfo
 */
export function toClassInfo(
  cls: ReplicatedClass,
  entryCount: number,
  judgeName?: string
): ClassInfo {
  // Parse class name for element/level (e.g., "Container Novice A")
  const parts = cls.name.split(' ');
  let element = cls.name;
  let level = cls.level;

  // Common scent work elements
  const elements = [
    'Container',
    'Interior',
    'Exterior',
    'Buried',
    'Handler Discrimination',
    'Elite',
  ];
  for (const el of elements) {
    if (cls.name.includes(el)) {
      element = el;
      level = cls.name.replace(el, '').trim() || cls.level;
      break;
    }
  }

  return {
    id: cls.id,
    name: cls.name,
    ...(level || parts[1] ? { level: level || parts[1] } : {}),
    ...(element || parts[0] ? { element: element || parts[0] } : {}),
    ...(judgeName ? { judge: judgeName } : {}),
    maxTime: formatTimeLimitFromClass(cls.timeLimitSeconds),
    entryCount,
  };
}

/**
 * Format timeLimitSeconds from the class record to M:SS display string.
 * Falls back to 3:00 (180s) if the field is missing (pre-migration classes).
 */
function formatTimeLimitFromClass(timeLimitSeconds?: number): string {
  const seconds = timeLimitSeconds ?? 180; // Default 3 minutes
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ── Shared scoring page utilities ──────────────────────────────────────────

export type Organization = 'AKC' | 'UKC' | 'ASCA' | 'Unknown';
export type SportType =
  | 'scent-work'
  | 'scent-work-nationals'
  | 'nosework'
  | 'rally'
  | 'obedience'
  | 'agility'
  | 'fast-cat'
  | 'unknown';

/**
 * Map trial sport_type code to organization and sport type.
 * Uses the authoritative sport_type from the trial record (Migration 029).
 */
export function mapSportType(sportTypeCode: string): {
  organization: Organization;
  sportType: SportType;
} {
  switch (sportTypeCode) {
    case 'akc-scent-work':
      return { organization: 'AKC', sportType: 'scent-work' };
    case 'akc-scent-work-nationals':
      return { organization: 'AKC', sportType: 'scent-work-nationals' };
    case 'akc-fast-cat':
      return { organization: 'AKC', sportType: 'fast-cat' };
    case 'ukc-nosework':
      return { organization: 'UKC', sportType: 'nosework' };
    case 'ukc-rally':
      return { organization: 'UKC', sportType: 'rally' };
    case 'ukc-obedience':
      return { organization: 'UKC', sportType: 'obedience' };
    case 'asca-scent-detection':
      return { organization: 'ASCA', sportType: 'scent-work' };
    default:
      return { organization: 'Unknown', sportType: 'unknown' };
  }
}

/** Map organization + sport string to ScoresheetSportType registry key. */
export function toRegistryKey(org: string, sport: string): ScoresheetSportType | null {
  const key = `${org}:${sport}`;
  switch (key) {
    case 'AKC:scent-work':
      return 'AKC_SCENT_WORK';
    case 'AKC:scent-work-nationals':
      return 'AKC_SCENT_WORK_NATIONAL';
    case 'AKC:fast-cat':
      return 'AKC_FASTCAT';
    case 'UKC:nosework':
      return 'UKC_NOSEWORK';
    case 'UKC:rally':
      return 'UKC_RALLY';
    case 'UKC:obedience':
      return 'UKC_OBEDIENCE';
    case 'ASCA:scent-work':
      return 'ASCA_SCENT_DETECTION';
    default:
      return null;
  }
}

/** Convert ScoringEntry to ScoresheetEntry for scoresheet props. */
export function toScoresheetEntry(entry: ScoringEntry, classInfo: ClassInfo): ScoresheetEntry {
  return {
    id: parseInt(entry.entryId, 10) || 0,
    armband: entry.armband,
    dogName: entry.callName,
    handlerName: entry.handler,
    className: classInfo.name,
    ...(classInfo.element != null && { element: classInfo.element }),
    ...(classInfo.level != null && { level: classInfo.level }),
  };
}

/** Convert ClassInfo to ScoresheetClassInfo for scoresheet props. */
export function toScoresheetClassInfo(info: ClassInfo): ScoresheetClassInfo {
  return {
    element: info.element || '',
    level: info.level || '',
  };
}
