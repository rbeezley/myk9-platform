/**
 * Web Worker for heavy data transformations
 * Offloads CPU-intensive operations from main thread
 */

/** Raw class data from Supabase views/tables */
interface RawClassData {
  id?: number;
  level?: string;
  class_level?: string;
  element?: string;
  element_type?: string;
  classtype?: string;
  class_name?: string;
  classname?: string;
  trial_date?: string;
  trial_number?: string | number;
  section?: string;
  judge_name?: string;
  judge?: string;
  entry_total_count?: number;
  entry_completed_count?: number;
  entry_pending_count?: number;
  class_status?: number | string;
  in_progress?: number;
  class_completed?: boolean;
  current_entry_id?: number;
  start_time?: string;
  end_time?: string;
  class_order?: number;
}

/** Raw entry data from Supabase views/tables */
interface RawEntryData {
  id: number;
  armband?: string | number;
  armband_number?: string | number;
  call_name?: string;
  dog_name?: string;
  breed?: string;
  handler?: string;
  handler_name?: string;
  handler_location?: string;
  handler_city?: string;
  class_id?: number;
  classid_fk?: number;
  in_ring?: boolean;
  is_scored?: boolean;
  score?: number;
  placement?: number;
  search_time?: number;
  element?: string;
  level?: string;
  trial_date?: string;
  trial_number?: string | number;
  sort_order?: number;
  checkin_status?: string | number;
  section?: string;
}

/** Transformed class data */
interface TransformedClass {
  id: number;
  class_name: string;
  element_type: string;
  judge_name: string;
  status: 'in-progress' | 'completed' | 'scheduled';
  current_entry_id?: number;
  start_time?: string;
  end_time?: string;
  entry_total_count: number;
  entry_completed_count: number;
  entry_pending_count: number;
  level: string;
  trial_date: string;
  trial_number: string | number;
  class_order: number;
}

/** Transformed entry data */
interface TransformedEntry {
  id: number;
  armband: string;
  dog_name: string;
  breed: string;
  handler_name: string;
  handler_location: string;
  class_id?: number;
  status: 'in_ring' | 'completed' | 'waiting';
  score?: number;
  placement?: number;
  search_time?: number;
  element?: string;
  level?: string;
  trial_date?: string;
  trial_number?: string | number;
  sort_order?: number;
  checkin_status?: string | number;
  section?: string;
}

/** Processed data result */
interface ProcessedData {
  inProgressClasses: TransformedClass[];
  currentClass: TransformedClass | null;
  currentEntry: TransformedEntry | null;
  nextEntries: TransformedEntry[];
  entriesByClass: Record<string, TransformedEntry[]>;
}

/** Message payload types */
type TransformPayload =
  | RawClassData[]
  | RawEntryData[]
  | { classes: TransformedClass[]; entries: TransformedEntry[] };

interface TransformMessage {
  type: 'TRANSFORM_CLASSES' | 'TRANSFORM_ENTRIES' | 'PROCESS_DATA';
  payload: TransformPayload;
}

/** Response result types */
type TransformResult = TransformedClass[] | TransformedEntry[] | ProcessedData | null;

interface TransformResponse {
  type: string;
  result: TransformResult;
  error?: string;
}

// Transform class data with section merging
function transformClassData(rawClasses: RawClassData[]): TransformedClass[] {
  const classGroups = rawClasses.reduce((groups: Record<string, RawClassData[]>, cls) => {
    const level = cls.level || cls.class_level || 'Unknown';
    const element = cls.element || cls.element_type || cls.classtype || 'Unknown';
    const trialDate = cls.trial_date || '';
    const trialNumber = cls.trial_number || '';

    const isNovice = level.toLowerCase().includes('novice');
    const groupKey = isNovice
      ? `${trialDate}-${trialNumber}-${element}-${level}`
      : `${trialDate}-${trialNumber}-${element}-${level}-${cls.section || ''}`;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(cls);

    return groups;
  }, {});

  return Object.values(classGroups).map((groupClasses, index): TransformedClass => {
    const mergedCounts = groupClasses.reduce((totals: { entry_total_count: number; entry_completed_count: number; entry_pending_count: number }, cls) => ({
      entry_total_count: totals.entry_total_count + (cls.entry_total_count || 0),
      entry_completed_count: totals.entry_completed_count + (cls.entry_completed_count || 0),
      entry_pending_count: totals.entry_pending_count + (cls.entry_pending_count || 0),
    }), { entry_total_count: 0, entry_completed_count: 0, entry_pending_count: 0 });

    const firstClass = groupClasses[0];
    const level = firstClass.level || firstClass.class_level || 'Unknown';
    const isNovice = level.toLowerCase().includes('novice');

    const hasInProgress = groupClasses.some(cls =>
      (cls.class_status === 5 || cls.class_status === 'in_progress' || cls.in_progress === 1)
    );
    const allCompleted = groupClasses.every(cls =>
      cls.class_status === 6 || cls.class_status === 'completed' || cls.class_completed === true
    );
    const entriesCompleted = mergedCounts.entry_completed_count === mergedCounts.entry_total_count && mergedCounts.entry_total_count > 0;

    const status = (hasInProgress && mergedCounts.entry_pending_count > 0) ? 'in-progress' :
                  (allCompleted || entriesCompleted) ? 'completed' :
                  'scheduled';

    return {
      id: firstClass.id || index,
      class_name: `${firstClass.element || firstClass.class_name || firstClass.classname || 'Unknown Class'}${isNovice && groupClasses.length > 1 ? ' (Combined A & B)' : ''}`,
      element_type: firstClass.element || firstClass.element_type || firstClass.classtype || 'Unknown',
      judge_name: firstClass.judge_name || firstClass.judge || 'TBD',
      status,
      current_entry_id: firstClass.current_entry_id,
      start_time: firstClass.start_time,
      end_time: firstClass.end_time,
      entry_total_count: mergedCounts.entry_total_count,
      entry_completed_count: mergedCounts.entry_completed_count,
      entry_pending_count: mergedCounts.entry_pending_count,
      level,
      trial_date: firstClass.trial_date || '',
      trial_number: firstClass.trial_number || '',
      class_order: firstClass.class_order || 0,
    };
  });
}

// Transform entry data
function transformEntryData(rawEntries: RawEntryData[]): TransformedEntry[] {
  return rawEntries.map((entry): TransformedEntry => ({
    id: entry.id,
    armband: String(entry.armband || entry.armband_number || 'N/A'),
    dog_name: entry.call_name || entry.dog_name || 'Unknown Dog',
    breed: entry.breed || 'Mixed Breed',
    handler_name: entry.handler || entry.handler_name || 'Unknown Handler',
    handler_location: entry.handler_location || entry.handler_city || '',
    class_id: entry.class_id || entry.classid_fk,
    status: entry.in_ring === true ? 'in_ring' : entry.is_scored === true ? 'completed' : 'waiting',
    score: entry.score,
    placement: entry.placement,
    search_time: entry.search_time,
    element: entry.element,
    level: entry.level,
    trial_date: entry.trial_date,
    trial_number: entry.trial_number,
    sort_order: entry.sort_order,
    checkin_status: entry.checkin_status,
    section: entry.section
  }));
}

// Process data (find in-progress classes, etc.)
function processData(classes: TransformedClass[], entries: TransformedEntry[]): ProcessedData {
  const inProgressClasses = classes
    .filter(cls => cls.status === 'in-progress')
    .sort((a, b) => {
      if (a.trial_date !== b.trial_date) {
        return (a.trial_date || '').localeCompare(b.trial_date || '');
      }
      if (a.trial_number !== b.trial_number) {
        return String(a.trial_number || '').localeCompare(String(b.trial_number || ''));
      }
      return (a.class_order || 0) - (b.class_order || 0);
    });

  // Group entries by class
  const entriesByClass = entries.reduce((groups: Record<string, TransformedEntry[]>, entry) => {
    const level = entry.level || 'Unknown';
    const element = entry.element || 'Unknown';
    const trialDate = entry.trial_date || '';
    const trialNumber = entry.trial_number || '';

    const isNovice = level.toLowerCase().includes('novice');
    const classKey = isNovice
      ? `${trialDate}-${trialNumber}-${element}-${level}`
      : `${trialDate}-${trialNumber}-${element}-${level}-${entry.section || ''}`;

    if (!groups[classKey]) {
      groups[classKey] = [];
    }
    groups[classKey].push(entry);
    return groups;
  }, {});

  return {
    inProgressClasses,
    currentClass: inProgressClasses[0] || null,
    currentEntry: null,
    nextEntries: [],
    entriesByClass,
  };
}

// Worker message handler
self.onmessage = (event: MessageEvent<TransformMessage>) => {
  const { type, payload } = event.data;

  try {
    let result: TransformResult;

    switch (type) {
      case 'TRANSFORM_CLASSES':
        result = transformClassData(payload as RawClassData[]);
        break;

      case 'TRANSFORM_ENTRIES':
        result = transformEntryData(payload as RawEntryData[]);
        break;

      case 'PROCESS_DATA': {
        const processPayload = payload as { classes: TransformedClass[]; entries: TransformedEntry[] };
        result = processData(processPayload.classes, processPayload.entries);
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    const response: TransformResponse = { type, result };
    self.postMessage(response);
  } catch (error) {
    const response: TransformResponse = {
      type,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    self.postMessage(response);
  }
};

// Export empty object to make this a module
export {};
