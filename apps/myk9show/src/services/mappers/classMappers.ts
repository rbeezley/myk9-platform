// Class Data Mappers - Phase 2.5: Class Store Integration
// Handles type conversion between classStore types and database types,
// and replication-to-DB-row mapping for offline-first reads.

import { mapFields } from './mapperUtils';
import type {
  DbClass,
  DbClassInsert,
  DbClassUpdate,
  DbEntry,
  DbEntryInsert,
  DbEntryUpdate,
} from '@/types/database-mappings';
import type {
  ClassInput,
  EntryInput,
  SyncableClassData,
  SyncableEntryData,
} from '@/store/classStore';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

// ===== JOINED DATA TYPES =====

/** Shape of a trial object when joined via Supabase select */
interface JoinedTrial {
  name?: string | null;
  date?: string | null;
  trial_number?: string | null;
}

/** Shape of a dog object when joined via Supabase select */
interface JoinedDog {
  name?: string | null;
}

/** Shape of a result object when joined via Supabase select */
interface JoinedResult {
  score?: string | null;
  time_seconds?: number | null;
  placement?: string | null;
}

/** DbClass with optional joined relations from Supabase queries */
export interface DbClassWithRelations extends DbClass {
  trial?: JoinedTrial | null;
  entry?: unknown[];
}

/** DbEntry with optional joined relations from Supabase queries */
export interface DbEntryWithRelations extends DbEntry {
  dog?: JoinedDog | null;
  class?: unknown;
  result?: JoinedResult | null;
}

// ===== TYPE HELPERS =====

/** Safely extract a JoinedTrial from an unknown value */
function extractTrial(value: JoinedTrial | null | undefined): JoinedTrial | null {
  if (value == null || typeof value !== 'object') return null;
  return value;
}

/** Safely extract a JoinedDog from an unknown value */
function extractDog(value: JoinedDog | null | undefined): JoinedDog | null {
  if (value == null || typeof value !== 'object') return null;
  return value;
}

/** Safely extract a JoinedResult from an unknown value */
function extractResult(value: JoinedResult | null | undefined): JoinedResult | null {
  if (value == null || typeof value !== 'object') return null;
  return value;
}

const VALID_CLASS_STATUSES = new Set<ClassInput['status']>([
  'Scheduled',
  'In Progress',
  'Completed',
  'Cancelled',
  'Upcoming',
]);

/** Map a database status string to a valid ClassInput status */
function mapClassStatus(status: string | null): ClassInput['status'] {
  if (status && VALID_CLASS_STATUSES.has(status as ClassInput['status'])) {
    return status as ClassInput['status'];
  }
  return 'Scheduled';
}

// ===== CLASS MAPPERS =====

/**
 * Convert ClassInput to database insert format
 */
export const mapClassInputToInsert = (classData: ClassInput): DbClassInsert => {
  return {
    // Trial reference
    trial_id: classData.trialId,

    // Core class information
    name: classData.className || 'Unnamed Class',
    level: classData.level || null,
    description: classData.element ? `${classData.element} ${classData.level}` : null,
    element: classData.element || null,
    section: classData.section || null,
    status: classData.status || 'Scheduled',
    class_number: classData.classNumber || null,

    // Entry configuration
    entry_fee: classData.entryFee || null,
    max_entries: classData.maxEntries || null,

    // Timing and scheduling
    start_time: classData.classOrder ? `${classData.classOrder}:00:00` : null,
    estimated_duration: null,

    // Height restrictions
    jump_heights: classData.requiresJumpHeight ? ['12"', '16"', '20"', '24"'] : null,
    height_min: null,
    height_max: null,

    // Age restrictions
    age_min: null,
    age_max: null,
    handler_age_min: null,
    handler_age_max: null,

    // Rules and restrictions
    allow_waitlist: true,
    breed_restrictions: null,
    max_dogs_per_handler: null,
  };
};

/**
 * Convert partial ClassInput to database update format
 */
export const mapClassInputToUpdate = (updates: Partial<ClassInput>): DbClassUpdate => {
  const updateData: DbClassUpdate = {};

  if (updates.className !== undefined) {
    updateData.name = updates.className;
  }
  if (updates.level !== undefined) {
    updateData.level = updates.level;
  }
  if (updates.status !== undefined) {
    // Map UI status (title case) to DB status (lowercase with underscores)
    const statusMap: Record<string, string> = {
      Scheduled: 'upcoming',
      Upcoming: 'upcoming',
      'In Progress': 'in_progress',
      Completed: 'completed',
      Cancelled: 'cancelled',
    };
    updateData.status = statusMap[updates.status] || updates.status;
  }
  if (updates.entryFee !== undefined) {
    updateData.entry_fee = updates.entryFee;
  }
  if (updates.maxEntries !== undefined) {
    updateData.max_entries = updates.maxEntries;
  }
  if (updates.classOrder !== undefined) {
    updateData.start_time = updates.classOrder ? `${updates.classOrder}:00:00` : null;
  }
  if (updates.requiresJumpHeight !== undefined) {
    updateData.jump_heights = updates.requiresJumpHeight ? ['12"', '16"', '20"', '24"'] : null;
  }
  if (updates.element !== undefined) {
    updateData.element = updates.element || null;
  }
  if (updates.element !== undefined || updates.level !== undefined) {
    const element = updates.element || '';
    const level = updates.level || '';
    updateData.description = element && level ? `${element} ${level}` : null;
  }
  if (updates.section !== undefined) {
    updateData.section = updates.section || null;
  }

  return updateData;
};

/**
 * Convert database class to SyncableClassData format
 */
export const mapDatabaseToClass = (dbClass: DbClassWithRelations): SyncableClassData => {
  const trial = extractTrial(dbClass.trial);

  // Extract judge from joined judge_assignments data
  const judgeAssignments = (dbClass as unknown as Record<string, unknown>).judge_assignments as
    | Array<{ person_id: string; people: { first_name: string; last_name: string } }>
    | undefined;
  const firstJudge = judgeAssignments?.[0];

  return {
    id: dbClass.id,
    trialId: dbClass.trial_id,
    trial: trial?.name || 'Unknown Trial',
    trialDate: trial?.date || new Date().toISOString().split('T')[0],
    trialNumber: trial?.trial_number || 'TBD',
    classOrder: dbClass.start_time ? extractClassOrder(dbClass.start_time) : '1',
    status: mapClassStatus(dbClass.status),
    judge: firstJudge
      ? `${firstJudge.people.first_name} ${firstJudge.people.last_name}`.trim()
      : 'TBD',
    judgeId: firstJudge?.person_id || '',

    // Class details
    className: dbClass.name,
    classNumber: dbClass.class_number ?? dbClass.id.substring(0, 8),
    element: dbClass.element ?? extractElement(dbClass.description),
    level: dbClass.level ?? '',
    section: dbClass.section ?? 'A',

    // Entry configuration
    entryFee: dbClass.entry_fee ?? 0,
    maxEntries: dbClass.max_entries ?? 40,
    requiresJumpHeight: Array.isArray(dbClass.jump_heights) && dbClass.jump_heights.length > 0,

    // Scent work specific fields (legacy compatibility)
    hidesUsed: '',
    distractionsUsed: '',
    itemsUsed: '',
    timeLimit1: '3:00',
    timeLimit2: '',
    timeLimit3: '',
    photoUrl: '',

    // Custom fields
    customFields: {},

    // Results release timestamp
    results_released_at: dbClass.results_released_at ?? null,

    // Sync metadata
    _version: 1,
    _lastModified: new Date(dbClass.updated_at || dbClass.created_at || new Date().toISOString()),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database classes to SyncableClassData array
 */
export const mapDatabaseClassesArray = (dbClasses: DbClassWithRelations[]): SyncableClassData[] => {
  return dbClasses.map(mapDatabaseToClass);
};

// ===== ENTRY MAPPERS =====

/**
 * Convert EntryInput to database insert format
 */
export const mapEntryInputToInsert = (entryData: EntryInput): DbEntryInsert => {
  return {
    class_id: entryData.classId,
    dog_id: entryData.dogId || null,
    show_id: entryData.showId || null,
    armband: entryData.armband,
    entry_status: mapEntryStatus(entryData.status),
    handler: entryData.handler,
  };
};

/**
 * Convert partial EntryInput to database update format
 */
export const mapEntryInputToUpdate = (updates: Partial<EntryInput>): DbEntryUpdate => {
  const updateData: DbEntryUpdate = {};

  if (updates.armband !== undefined) {
    updateData.armband = updates.armband;
  }
  if (updates.handler !== undefined) {
    updateData.handler = updates.handler;
  }
  if (updates.status !== undefined) {
    updateData.entry_status = mapEntryStatus(updates.status);
  }

  return updateData;
};

/**
 * Convert database entry to SyncableEntryData format
 */
export const mapDatabaseToEntry = (dbEntry: DbEntryWithRelations): SyncableEntryData => {
  const dog = extractDog(dbEntry.dog);
  const result = extractResult(dbEntry.result);

  return {
    id: dbEntry.id,
    armband: dbEntry.armband || '',
    handler: dbEntry.handler || 'Unknown',
    dog: dog?.name || 'Unknown Dog',
    status: mapDatabaseEntryStatus(dbEntry.entry_status),
    score: result?.score || '',
    time: result?.time_seconds?.toString() || '',
    placement: result?.placement || '',
    classId: dbEntry.class_id || '',

    // Sync metadata
    _version: 1,
    _lastModified: new Date(dbEntry.updated_at || dbEntry.created_at || new Date().toISOString()),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database entries to SyncableEntryData array
 */
export const mapDatabaseEntriesArray = (dbEntries: DbEntryWithRelations[]): SyncableEntryData[] => {
  return dbEntries.map(mapDatabaseToEntry);
};

// ===== HELPER FUNCTIONS =====

/**
 * Extract class order from start_time
 */
const extractClassOrder = (startTime: string): string => {
  if (!startTime) return '1';
  const hour = startTime.split(':')[0];
  return hour || '1';
};

/**
 * Extract element from description
 */
const extractElement = (description: string | null): string => {
  if (!description) return '';
  const parts = description.split(' ');
  return parts[0] || '';
};

/**
 * Map entry status from classStore format to database format
 */
const mapEntryStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    Qualified: 'qualified',
    'Not Qualified': 'not_qualified',
    Absent: 'absent',
    Excused: 'excused',
    Withdrawn: 'withdrawn',
  };
  return statusMap[status] || 'pending';
};

/**
 * Map entry status from database format to classStore format
 */
const mapDatabaseEntryStatus = (
  status: string | null
): 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated' => {
  if (!status) return 'Not Qualified';

  const statusMap: Record<
    string,
    'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated'
  > = {
    qualified: 'Qualified',
    not_qualified: 'Not Qualified',
    absent: 'Absent',
    excused: 'Excused',
    withdrawn: 'Withdrawn',
    pending: 'Not Qualified',
  };
  return statusMap[status] || 'Not Qualified';
};

// ---------------------------------------------------------------------------
// Replication mappers — convert camelCase replicated types to snake_case DB
// row shapes so downstream consumers (stores, UI) see the same shape as
// PostgREST responses.
// ---------------------------------------------------------------------------

/**
 * Convert a ReplicatedClass to the snake_case DB row shape that consumers
 * expect from PostgREST `select('*')`.
 *
 * Optionally attach joined `trial`, `entries`, and `judge_assignments` when
 * the corresponding replicated data is provided.
 */
export const mapReplicatedClassToDbRow = (
  cls: ReplicatedClass,
  options?: {
    trial?: {
      id: string;
      name: string;
      date: string;
      trialNumber?: string;
      status?: string;
    } | null;
    entryCount?: number;
    judgeAssignments?: Array<{
      person_id: string;
      people: { first_name: string; last_name: string };
    }>;
    entries?: Array<Record<string, unknown>>;
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    ...mapFields(cls as unknown as Record<string, unknown>, {
      id: 'id',
      trial_id: 'trialId',
      name: 'name',
      description: 'description',
      entry_fee: 'entryFee',
      jump_heights: 'jumpHeights',
      max_entries: 'maxEntries',
      allow_waitlist: 'allowsWaitlist',
      max_dogs_per_handler: 'maxDogsPerHandler',
      level: 'level',
      breed_restrictions: 'breedRestrictions',
      age_min: 'ageMin',
      age_max: 'ageMax',
      height_min: 'heightMin',
      height_max: 'heightMax',
      handler_age_min: 'handlerAgeMin',
      handler_age_max: 'handlerAgeMax',
      start_time: 'startTime',
      estimated_duration: 'estimatedDuration',
      element: 'element',
      section: 'section',
      status: 'classStatus',
      class_order: 'classOrder',
    }),
    is_completed: cls.isCompleted ?? false,
    is_scoring_finalized: cls.isScoringFinalized ?? false,
    is_results_reviewed: cls.isResultsReviewed ?? false,
    deleted_at: null,
  };

  // Attach trial sub-object when provided
  if (options?.trial) {
    row.trial = {
      id: options.trial.id,
      name: options.trial.name,
      date: options.trial.date,
      trial_number: options.trial.trialNumber ?? null,
      status: options.trial.status ?? null,
    };
  } else {
    row.trial = null;
  }

  // Attach entries array (id-only for count) when entryCount is provided
  if (options?.entryCount !== undefined) {
    row.entries = Array.from({ length: options.entryCount }, (_, i) => ({ id: `entry-${i}` }));
  }

  // Attach full entries when provided (for getClassById detail shape)
  if (options?.entries) {
    row.entries = options.entries;
  }

  // Attach judge_assignments. Caller-supplied wins (PostgREST round-trip case
  // where the joined data is already in hand). Otherwise synthesize from the
  // denormalized judgeId + judgeName fields the replication layer stores —
  // without this, downstream readers (`mapDatabaseToClass`) see no judge
  // even though the replicated row knows the answer.
  if (options?.judgeAssignments) {
    row.judge_assignments = options.judgeAssignments;
  } else if (cls.judgeId && cls.judgeName) {
    const [first, ...rest] = cls.judgeName.trim().split(' ');
    row.judge_assignments = [
      {
        person_id: cls.judgeId,
        people: { first_name: first ?? '', last_name: rest.join(' ') },
      },
    ];
  }

  return row;
};

/**
 * Map a ReplicatedEntry to the snake_case entry sub-object shape returned
 * by PostgREST when selecting entries with dog join in getClassById.
 */
export const mapReplicatedEntryToDetailRow = (
  entry: ReplicatedEntry,
  dog?: ReplicatedDog | null
): Record<string, unknown> => {
  const entryRow: Record<string, unknown> = mapFields(entry as unknown as Record<string, unknown>, {
    id: 'id',
    entry_status: 'entryStatus',
    points_earned: 'totalPoints',
    search_time_seconds: 'searchTimeSeconds',
    final_placement: 'finalPlacement',
  });

  if (dog) {
    entryRow.dog = {
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      owner: null, // people table not replicated — omit deep owner detail
    };
  } else {
    entryRow.dog = {
      id: entry.dogId ?? null,
      name: entry.dogCallName ?? 'Unknown',
      breed: entry.dogBreed ?? '',
      owner: null,
    };
  }

  return entryRow;
};
