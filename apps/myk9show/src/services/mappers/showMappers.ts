// Type mapping utilities for Show entity between Zustand and Supabase
import type { Show, ShowInput } from '@/types/show-types';
import type { DbShow, DbShowInsert, DbShowUpdate } from '@/types/database-mappings';

/**
 * Maps ShowInput (from Zustand store) to DbShowInsert (for Supabase insertion)
 */
export const mapShowInputToInsert = (input: ShowInput): DbShowInsert => {
  return {
    name: input.name,
    type: input.type,
    start_date: input.startDate,
    end_date: input.endDate,
    location: input.location,
    status: input.status,
    entry_open_date: input.entryOpenDate,
    entry_close_date: input.entryCloseDate,
    pre_entry_fee: parseFloat(input.preEntryFee) || null,
    day_of_show_fee: input.dayOfShowFee ? parseFloat(input.dayOfShowFee) : null,
    club_id: input.clubId,
    chairman: input.chairman,
    secretary: input.secretary,
    chief_steward: input.chiefSteward,
    max_entries_per_dog: null, // Will be set from trials
    max_total_entries: null, // Will be set from trials
    allows_non_owner_handlers: true, // Default to true
    
    // Additional fields that may not be in the actual schema but are in our types
    ...(input.events && { events: input.events } as Record<string, unknown>),
    ...(input.source && { source: input.source } as Record<string, unknown>),
    ...(input.clubName && { club_name: input.clubName } as Record<string, unknown>),
    ...(input.clubAddress && { club_address: input.clubAddress } as Record<string, unknown>),
    ...(input.clubEmail && { club_email: input.clubEmail } as Record<string, unknown>),
    // Note: assignedJudges mapping removed as assigned_judges column doesn't exist in database schema
  } as DbShowInsert;
};

/**
 * Maps ShowInput (from Zustand store) to DbShowUpdate (for Supabase updates)
 */
export const mapShowInputToUpdate = (input: Partial<ShowInput>): DbShowUpdate => {
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.type !== undefined) update.type = input.type;
  if (input.startDate !== undefined) update.start_date = input.startDate;
  if (input.endDate !== undefined) update.end_date = input.endDate;
  if (input.location !== undefined) update.location = input.location;
  if (input.status !== undefined) update.status = input.status;
  if (input.entryOpenDate !== undefined) update.entry_open_date = input.entryOpenDate;
  if (input.entryCloseDate !== undefined) update.entry_close_date = input.entryCloseDate;
  if (input.preEntryFee !== undefined) update.pre_entry_fee = parseFloat(input.preEntryFee) || null;
  if (input.dayOfShowFee !== undefined) update.day_of_show_fee = input.dayOfShowFee ? parseFloat(input.dayOfShowFee) : null;
  if (input.clubId !== undefined) update.club_id = input.clubId;
  if (input.chairman !== undefined) update.chairman = input.chairman;
  if (input.secretary !== undefined) update.secretary = input.secretary;
  if (input.chiefSteward !== undefined) update.chief_steward = input.chiefSteward;
  
  // Additional fields that may not be in the actual schema
  if (input.events !== undefined) update.events = input.events;
  if (input.source !== undefined) update.source = input.source;
  if (input.clubName !== undefined) update.club_name = input.clubName;
  if (input.clubAddress !== undefined) update.club_address = input.clubAddress;
  if (input.clubEmail !== undefined) update.club_email = input.clubEmail;
  // Note: assignedJudges mapping removed as assigned_judges column doesn't exist in database schema

  return update as unknown as DbShowUpdate;
};

/**
 * Maps DbShow (from Supabase) to Show (for Zustand store)
 */
export const mapDatabaseToShow = (dbShow: DbShow & { trial?: unknown[], club?: unknown, judge_assignment?: unknown[] }): Show => {
  // Map trials from database format (if available)
  const trials = (dbShow.trial || []).map((trial: unknown) => {
    const trialObj = trial as Record<string, unknown>;
    return {
      id: trialObj.id as string,
      name: (trialObj.name || '') as string,
      date: (trialObj.date || '') as string,
      trialNumber: (trialObj.trial_number || '') as string,
      status: (trialObj.status || 'planned') as string,
      classes: ((trialObj.class as unknown[]) || []).map((cls: unknown) => {
        const classObj = cls as Record<string, unknown>;
        return {
          id: classObj.id as string,
          name: classObj.name as string,
          description: (classObj.description || '') as string,
          entryFee: (classObj.entry_fee || 0) as number,
          jumpHeights: (classObj.jump_heights || []) as string[],
          maxEntries: classObj.max_entries as number | undefined,
          allowWaitlist: (classObj.allow_waitlist || false) as boolean,
          maxDogsPerHandler: classObj.max_dogs_per_handler as number | undefined,
          level: classObj.level as string | undefined,
          breedRestrictions: (classObj.breed_restrictions || []) as string[],
          ageRestrictions: classObj.age_restrictions ? {
            min: (classObj.age_restrictions as Record<string, unknown>).min as number,
            max: (classObj.age_restrictions as Record<string, unknown>).max as number
          } : undefined,
          heightRestrictions: classObj.height_restrictions ? {
            min: (classObj.height_restrictions as Record<string, unknown>).min as number,
            max: (classObj.height_restrictions as Record<string, unknown>).max as number
          } : undefined,
          handlerAgeRestrictions: classObj.handler_age_restrictions ? {
            min: (classObj.handler_age_restrictions as Record<string, unknown>).min as number,
            max: (classObj.handler_age_restrictions as Record<string, unknown>).max as number
          } : undefined,
          startTime: classObj.start_time as string | undefined,
          estimatedDuration: classObj.estimated_duration as number | undefined
        };
      }),
      maxEntriesPerDog: trialObj.max_entries_per_dog as number | undefined,
      maxTotalEntries: trialObj.max_total_entries as number | undefined,
      maxEntriesPerHandler: trialObj.max_entries_per_handler as number | undefined
    };
  });

  // Map judge assignments from judge_assignment table
  const assignedJudges = (dbShow.judge_assignment || [])
    .filter((assignment: unknown) => {
      const assignmentObj = assignment as Record<string, unknown>;
      return assignmentObj.assignment_type === 'judge'; // Only include judge assignments, not stewards etc.
    })
    .map((assignment: unknown) => {
      const assignmentObj = assignment as Record<string, unknown>;
      const judge = assignmentObj.judge as Record<string, unknown>;
      
      return {
        judgeId: assignmentObj.judge_id as string,
        judgeName: `${judge?.first_name || ''} ${judge?.last_name || ''}`.trim(),
        assignedDate: (assignmentObj.assignment_date as string) || new Date().toISOString().split('T')[0],
        availableStartTime: (assignmentObj.special_requirements as string)?.includes('morning') ? 'Morning' : 'Full Day',
        availableEndTime: (assignmentObj.special_requirements as string)?.includes('afternoon') ? 'Afternoon' : 'Full Day',
        // Additional fields from judge_assignment table
        assignmentStatus: assignmentObj.assignment_status as string || 'confirmed',
        compensationAmount: assignmentObj.compensation_amount as number || undefined,
        expensesCovered: assignmentObj.expenses_covered as boolean || false,
        travelProvided: assignmentObj.travel_provided as boolean || false,
        specialRequirements: assignmentObj.special_requirements as string || undefined,
        notes: assignmentObj.notes as string || undefined,
        confirmedBy: assignmentObj.confirmed_by as string || undefined,
        confirmedAt: assignmentObj.confirmed_at as string || undefined
      };
    });

  return {
    id: dbShow.id,
    name: dbShow.name,
    type: dbShow.type,
    startDate: dbShow.start_date,
    endDate: dbShow.end_date,
    location: dbShow.location || '',
    status: dbShow.status || 'upcoming',
    events: [dbShow.type], // Convert the type to an events array
    source: ((dbShow as Record<string, unknown>).source as 'myK9Show' | 'external') || 'myK9Show', // Use source from database or default
    entryOpenDate: dbShow.entry_open_date || '',
    entryCloseDate: dbShow.entry_close_date || '',
    preEntryFee: dbShow.pre_entry_fee?.toString() || '0',
    dayOfShowFee: dbShow.day_of_show_fee?.toString() || undefined,
    entryDeadline: (dbShow as Record<string, unknown>).entry_deadline as string | undefined,
    lateEntryDeadline: (dbShow as Record<string, unknown>).late_entry_deadline as string | undefined,
    clubId: dbShow.club_id || '',
    clubName: (dbShow as Record<string, unknown>).club_name as string || (dbShow.club as Record<string, unknown>)?.name as string || '', // Direct field or relation
    clubAddress: (dbShow as Record<string, unknown>).club_address as string || (dbShow.club as Record<string, unknown>)?.address as string || '', // Direct field or relation
    clubEmail: (dbShow as Record<string, unknown>).club_email as string || (dbShow.club as Record<string, unknown>)?.email as string || '', // Direct field or relation
    chairman: dbShow.chairman || '',
    secretary: dbShow.secretary || '',
    chiefSteward: dbShow.chief_steward || '',
    assignedJudges: assignedJudges, // Mapped from judge_assignment table
    stats: [], // Initialize empty stats - will be calculated separately
    trials: trials,
    maxEntriesPerDog: dbShow.max_entries_per_dog || undefined,
    maxTotalEntries: dbShow.max_total_entries || undefined,
    allowNonOwnerHandlers: dbShow.allows_non_owner_handlers || true,

    // Sync metadata for Local-First architecture
    _version: 1, // Default version
    _lastModified: new Date(dbShow.updated_at || dbShow.created_at || new Date().toISOString()),
    _lastModifiedBy: 'system', // Default value
    _syncStatus: 'synced',
    _localOnly: false
  };
};

/**
 * Maps array of DbShow to array of Show
 */
export const mapDatabaseShowsArray = (dbShows: (DbShow & { trial?: unknown[], club?: unknown, judge_assignment?: unknown[] })[]): Show[] => {
  return dbShows.map(mapDatabaseToShow);
};

/**
 * Maps Show (from Zustand store) back to ShowInput for form editing
 */
export const mapShowToShowInput = (show: Show): ShowInput => {
  return {
    name: show.name,
    type: show.type,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location,
    status: show.status,
    events: show.events,
    source: show.source,
    entryOpenDate: show.entryOpenDate,
    entryCloseDate: show.entryCloseDate,
    preEntryFee: show.preEntryFee,
    dayOfShowFee: show.dayOfShowFee,
    clubId: show.clubId,
    clubName: show.clubName,
    clubAddress: show.clubAddress,
    clubEmail: show.clubEmail,
    chairman: show.chairman,
    secretary: show.secretary,
    chiefSteward: show.chiefSteward,
    assignedJudges: show.assignedJudges,
    trials: show.trials
  };
};

/**
 * Utility function to safely parse JSON fields
 */
export const safeParseJson = <T>(jsonString: string | null | undefined, fallback: T): T => {
  if (!jsonString) return fallback;
  
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return fallback;
  }
};

/**
 * Utility function to validate show data before mapping
 */
export const validateShowData = (show: Show | ShowInput): string[] => {
  const errors: string[] = [];

  if (!show.name?.trim()) {
    errors.push('Show name is required');
  }

  if (!show.type?.trim()) {
    errors.push('Show type is required');
  }

  if (!show.startDate) {
    errors.push('Start date is required');
  }

  if (!show.endDate) {
    errors.push('End date is required');
  }

  if (show.startDate && show.endDate && new Date(show.startDate) > new Date(show.endDate)) {
    errors.push('Start date must be before end date');
  }

  if (!show.location?.trim()) {
    errors.push('Location is required');
  }

  if (!show.clubId?.trim()) {
    errors.push('Club selection is required');
  }

  if (!show.secretary?.trim()) {
    errors.push('Secretary is required');
  }

  if (!show.chairman?.trim()) {
    errors.push('Chairman is required');
  }

  if (!show.entryOpenDate) {
    errors.push('Entry open date is required');
  }

  if (!show.entryCloseDate) {
    errors.push('Entry close date is required');
  }

  if (show.entryOpenDate && show.entryCloseDate && new Date(show.entryOpenDate) > new Date(show.entryCloseDate)) {
    errors.push('Entry open date must be before entry close date');
  }

  return errors;
};

/**
 * Create a default ShowInput for new show creation
 */
export const createDefaultShowInput = (): Partial<ShowInput> => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  
  return {
    name: '',
    type: 'Agility Trial',
    startDate: nextMonth.toISOString().split('T')[0],
    endDate: nextMonth.toISOString().split('T')[0],
    location: '',
    status: 'upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    entryOpenDate: today.toISOString().split('T')[0],
    entryCloseDate: new Date(nextMonth.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week before
    preEntryFee: '25.00',
    dayOfShowFee: '30.00',
    clubId: '',
    clubName: '',
    clubAddress: '',
    clubEmail: '',
    chairman: '',
    secretary: '',
    chiefSteward: '',
    assignedJudges: [],
    trials: []
  };
};