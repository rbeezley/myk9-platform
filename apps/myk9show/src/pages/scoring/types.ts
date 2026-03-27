/**
 * Types for scoring pages
 *
 * Adapts myK9Show's ReplicatedEntry to work with @myk9/scoring-ui hooks.
 */

import type {
  BaseEntry,
  ScoreData,
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
} from '@myk9/scoring-ui';
import type { ScoreSubmissionData } from '@/hooks/useOptimisticScoring';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
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
    // BaseEntry required fields (numeric id for hooks — entries use auto-increment integers)
    id: parseInt(entry.id, 10) || index + 1,

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
 * Map a sport_type code (e.g. 'akc-scent-work') to organization and sport type.
 * The code is derived at runtime via deriveSportType(org, trialType).
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

/**
 * Derive the sport_type code from an organization and trial discipline.
 * Inverse of mapSportType() — used when creating/editing trials.
 * Returns null for org/discipline combos without a registered scoresheet.
 */
const SPORT_TYPE_BY_ORG_DISCIPLINE: Record<string, string> = {
  'AKC:Scent Work': 'akc-scent-work',
  'AKC:Scent Work Nationals': 'akc-scent-work-nationals',
  'AKC:FastCAT': 'akc-fast-cat',
  'UKC:Nosework': 'ukc-nosework',
  'UKC:Rally': 'ukc-rally',
  'UKC:Obedience': 'ukc-obedience',
  'UKC:Obedience & Rally': 'ukc-obedience',
  'ASCA:Scent Detection': 'asca-scent-detection',
};

export function deriveSportType(organization: string, trialType: string): string | null {
  return SPORT_TYPE_BY_ORG_DISCIPLINE[`${organization}:${trialType}`] ?? null;
}

/** Resolve sport type for a class by walking trial → show → deriveSportType. */
export async function resolveSportTypeForClass(trialId: string | undefined): Promise<string | null> {
  if (!trialId) return null;
  const trial = await replicatedTrialsTable.getTrialById(trialId);
  if (!trial?.showId || !trial.trialType) return null;
  const show = await replicatedShowsTable.get(trial.showId);
  if (!show?.organization) return null;
  return deriveSportType(show.organization, trial.trialType);
}

/**
 * Detect organization and sport type from class name.
 * @deprecated Use deriveSportType(org, trialType) + mapSportType() instead.
 * Kept as fallback for edge cases where org/trialType are unavailable.
 */
export function detectScoresheetType(classInfo: ClassInfo): {
  organization: Organization;
  sportType: SportType;
} {
  const name = classInfo.name.toLowerCase();

  let organization: Organization = 'AKC';
  if (name.includes('ukc') || name.includes('united kennel')) {
    organization = 'UKC';
  } else if (name.includes('asca') || name.includes('australian shepherd')) {
    organization = 'ASCA';
  } else if (name.includes('akc') || name.includes('american kennel')) {
    organization = 'AKC';
  }

  let sportType: SportType = 'unknown';
  if (name.includes('nationals') || name.includes('national')) {
    sportType = 'scent-work-nationals';
  } else if (name.includes('fast cat') || name.includes('fastcat')) {
    sportType = 'fast-cat';
  } else if (name.includes('nosework')) {
    sportType = 'nosework';
  } else if (name.includes('scent detection')) {
    sportType = 'scent-work';
  } else if (
    name.includes('container') ||
    name.includes('interior') ||
    name.includes('exterior') ||
    name.includes('buried') ||
    name.includes('scent') ||
    name.includes('handler disc')
  ) {
    sportType = 'scent-work';
  } else if (name.includes('rally')) {
    sportType = 'rally';
  } else if (name.includes('obedience')) {
    sportType = 'obedience';
  } else if (name.includes('agility')) {
    sportType = 'agility';
  }

  return { organization, sportType };
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

/**
 * Convert ScoreData from a scoresheet into the optimistic scoring payload shape.
 * Strips zero/empty values to keep the payload lean.
 */
export function toOptimisticScorePayload(scoreData: ScoreData): ScoreSubmissionData['scoreData'] {
  return {
    resultText: scoreData.resultText,
    searchTime: scoreData.searchTime || '',
    faultCount: scoreData.faultCount || 0,
    ...(scoreData.areaTimes &&
      scoreData.areaTimes.length > 0 && { areaTimes: scoreData.areaTimes }),
    ...(scoreData.nonQualifyingReason && { nonQualifyingReason: scoreData.nonQualifyingReason }),
    ...(scoreData.element && { element: scoreData.element }),
    ...(scoreData.level && { level: scoreData.level }),
    ...(scoreData.correctCount > 0 && { correctCount: scoreData.correctCount }),
    ...(scoreData.incorrectCount > 0 && { incorrectCount: scoreData.incorrectCount }),
    ...(scoreData.finishCallErrors > 0 && { finishCallErrors: scoreData.finishCallErrors }),
    ...(scoreData.points > 0 && { points: scoreData.points }),
    ...(Object.keys(scoreData.areas).length > 0 && { areas: scoreData.areas }),
  };
}
