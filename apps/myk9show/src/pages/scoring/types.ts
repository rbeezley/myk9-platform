/**
 * Types for scoring pages
 *
 * Adapts myK9Show's ReplicatedEntry to work with @myk9/scoring-ui hooks.
 */

import type { BaseEntry } from '@myk9/scoring-ui';
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

    // Optional fields
    placement: undefined,
    result: undefined,
    section: undefined,
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
  const elements = ['Container', 'Interior', 'Exterior', 'Buried', 'Handler Discrimination', 'Elite'];
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
    level: level || parts[1],
    element: element || parts[0],
    judge: judgeName,
    maxTime: getMaxTimeForLevel(level),
    entryCount,
  };
}

/**
 * Get max time for scent work levels
 */
function getMaxTimeForLevel(level?: string): string {
  const normalizedLevel = level?.toLowerCase() || '';

  if (normalizedLevel.includes('novice')) return '2:00';
  if (normalizedLevel.includes('advanced')) return '2:30';
  if (normalizedLevel.includes('excellent')) return '2:30';
  if (normalizedLevel.includes('master')) return '3:00';
  if (normalizedLevel.includes('detective')) return '3:00';
  if (normalizedLevel.includes('elite')) return '4:00';

  return '3:00'; // Default
}
