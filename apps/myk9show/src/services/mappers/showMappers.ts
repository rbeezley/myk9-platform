// Type mapping utilities for Show entity between Zustand and Supabase
import type { Show, ShowInput } from '@/types/show-types';
import type { DbShow, DbShowInsert, DbShowUpdate } from '@/types/database-mappings';
import { logger } from '@/services/LoggingService';

/**
 * Maps ShowInput (from Zustand store) to DbShowInsert (for Supabase insertion)
 */
export const mapShowInputToInsert = (input: ShowInput): DbShowInsert => {
  return {
    name: input.name,
    organization: input.organization,
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
    allow_non_owner_handlers: true, // Default to true
    logo_url: input.logoUrl || null,
    cover_image_url: input.coverImageUrl || null,
    accent_color: input.accentColor || null,
    confirmation_message: input.confirmationMessage || null,

    // Note: events, source, club_name, club_address, club_email do NOT exist in the
    // database schema. These are app-only fields derived from the club relation or
    // computed locally. Sending them to Supabase would cause insert errors.
    // assignedJudges are stored in the separate judge_assignments table, not on shows.
    // TODO: Remove `as DbShowInsert` cast after regenerating Supabase types (run `supabase gen types`)
  } as DbShowInsert;
};

/**
 * Maps ShowInput (from Zustand store) to DbShowUpdate (for Supabase updates)
 */
export const mapShowInputToUpdate = (input: Partial<ShowInput>): DbShowUpdate => {
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.organization !== undefined) update.organization = input.organization;
  if (input.startDate !== undefined) update.start_date = input.startDate;
  if (input.endDate !== undefined) update.end_date = input.endDate;
  if (input.location !== undefined) update.location = input.location;
  if (input.status !== undefined) update.status = input.status;
  if (input.entryOpenDate !== undefined) update.entry_open_date = input.entryOpenDate;
  if (input.entryCloseDate !== undefined) update.entry_close_date = input.entryCloseDate;
  if (input.preEntryFee !== undefined) update.pre_entry_fee = parseFloat(input.preEntryFee) || null;
  if (input.dayOfShowFee !== undefined)
    update.day_of_show_fee = input.dayOfShowFee ? parseFloat(input.dayOfShowFee) : null;
  if (input.clubId !== undefined) update.club_id = input.clubId;
  if (input.chairman !== undefined) update.chairman = input.chairman;
  if (input.secretary !== undefined) update.secretary = input.secretary;
  if (input.chiefSteward !== undefined) update.chief_steward = input.chiefSteward;
  if (input.logoUrl !== undefined) update.logo_url = input.logoUrl || null;
  if (input.coverImageUrl !== undefined) update.cover_image_url = input.coverImageUrl || null;
  if (input.accentColor !== undefined) update.accent_color = input.accentColor || null;
  if (input.confirmationMessage !== undefined)
    update.confirmation_message = input.confirmationMessage || null;

  // Note: events, source, club_name, club_address, club_email do NOT exist in the
  // database schema. These are app-only fields derived from the club relation or
  // computed locally. assignedJudges are stored in the separate judge_assignments table.

  return update as DbShowUpdate;
};

/**
 * Maps DbShow (from Supabase) to Show (for Zustand store)
 */
export const mapDatabaseToShow = (
  dbShow: DbShow & {
    trial?: unknown[];
    trials?: unknown[];
    club?: unknown;
    judge_assignment?: unknown[];
    judge_assignments?: unknown[];
  }
): Show => {
  // Map trials from database format (if available)
  // Supabase returns the key matching the table name ("trials", plural) or the alias ("trial", singular)
  const rawTrials = dbShow.trials || dbShow.trial || [];
  const trials = rawTrials.map((trial: unknown) => {
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
          ageRestrictions: classObj.age_restrictions
            ? {
                min: (classObj.age_restrictions as Record<string, unknown>).min as number,
                max: (classObj.age_restrictions as Record<string, unknown>).max as number,
              }
            : undefined,
          heightRestrictions: classObj.height_restrictions
            ? {
                min: (classObj.height_restrictions as Record<string, unknown>).min as number,
                max: (classObj.height_restrictions as Record<string, unknown>).max as number,
              }
            : undefined,
          handlerAgeRestrictions: classObj.handler_age_restrictions
            ? {
                min: (classObj.handler_age_restrictions as Record<string, unknown>).min as number,
                max: (classObj.handler_age_restrictions as Record<string, unknown>).max as number,
              }
            : undefined,
          startTime: classObj.start_time as string | undefined,
          estimatedDuration: classObj.estimated_duration as number | undefined,
        };
      }),
      maxEntriesPerDog: trialObj.max_entries_per_dog as number | undefined,
      maxTotalEntries: trialObj.max_total_entries as number | undefined,
      maxEntriesPerHandler: trialObj.max_entries_per_handler as number | undefined,
    };
  });

  // Map judge assignments from judge_assignments table
  const rawJudgeAssignments = dbShow.judge_assignments || dbShow.judge_assignment || [];
  const assignedJudges = (rawJudgeAssignments as Array<Record<string, unknown>>).map(
    assignmentObj => {
      // The join uses alias "judge:people(...)" so data is under "judge" key
      const person = (assignmentObj.judge || assignmentObj.people) as
        | Record<string, unknown>
        | undefined;

      return {
        judgeId: (assignmentObj.person_id as string) || '',
        judgeName: person ? `${person.first_name || ''} ${person.last_name || ''}`.trim() : '',
        assignedDate:
          (assignmentObj.confirmed_at as string)?.split('T')[0] ||
          (assignmentObj.created_at as string)?.split('T')[0] ||
          new Date().toISOString().split('T')[0],
        availableStartTime: 'Full Day',
        availableEndTime: 'Full Day',
        // Additional fields from judge_assignment table
        assignmentStatus: (assignmentObj.assignment_status as string) || 'confirmed',
        compensationAmount: (assignmentObj.compensation_amount as number) || undefined,
        expensesCovered: (assignmentObj.expenses_covered as boolean) || false,
        travelProvided: (assignmentObj.travel_provided as boolean) || false,
        specialRequirements: (assignmentObj.special_requirements as string) || undefined,
        notes: (assignmentObj.notes as string) || undefined,
        confirmedBy: (assignmentObj.confirmed_by as string) || undefined,
        confirmedAt: (assignmentObj.confirmed_at as string) || undefined,
      };
    }
  );

  return {
    id: dbShow.id,
    name: dbShow.name,
    organization: dbShow.organization,
    startDate: dbShow.start_date,
    endDate: dbShow.end_date,
    location: dbShow.location || '',
    status: dbShow.status || 'upcoming',
    // Extract unique sport types from trials (e.g., "Scent Work", "Agility")
    // Falls back to organization if no trials have sport_type set
    events: (() => {
      const sportTypes = [
        ...new Set(
          (rawTrials as Array<Record<string, unknown>>)
            .map(t => t.sport_type as string | null)
            .filter((s): s is string => !!s)
        ),
      ];
      return sportTypes.length > 0 ? sportTypes : [dbShow.organization];
    })(),
    source: ((dbShow as Record<string, unknown>).source as 'myK9Show' | 'external') || 'myK9Show', // Use source from database or default
    entryOpenDate: dbShow.entry_open_date || '',
    entryCloseDate: dbShow.entry_close_date || '',
    preEntryFee: dbShow.pre_entry_fee?.toString() || '0',
    dayOfShowFee: dbShow.day_of_show_fee?.toString() || undefined,
    entryDeadline: (dbShow as Record<string, unknown>).entry_deadline as string | undefined,
    lateEntryDeadline: (dbShow as Record<string, unknown>).late_entry_deadline as
      | string
      | undefined,
    clubId: dbShow.club_id || '',
    clubName:
      ((dbShow as Record<string, unknown>).club_name as string) ||
      ((dbShow.club as Record<string, unknown>)?.name as string) ||
      '', // Direct field or relation
    clubAddress:
      ((dbShow as Record<string, unknown>).club_address as string) ||
      ((dbShow.club as Record<string, unknown>)?.address as string) ||
      '', // Direct field or relation
    clubEmail:
      ((dbShow as Record<string, unknown>).club_email as string) ||
      ((dbShow.club as Record<string, unknown>)?.email as string) ||
      '', // Direct field or relation
    logoUrl:
      dbShow.logo_url || ((dbShow.club as Record<string, unknown>)?.logo_url as string) || '',
    coverImageUrl:
      dbShow.cover_image_url ||
      ((dbShow.club as Record<string, unknown>)?.cover_image_url as string) ||
      '',
    accentColor:
      dbShow.accent_color ||
      ((dbShow.club as Record<string, unknown>)?.accent_color as string) ||
      '',
    chairman: dbShow.chairman || '',
    secretary: dbShow.secretary || '',
    chiefSteward: dbShow.chief_steward || '',
    assignedJudges: assignedJudges, // Mapped from judge_assignment table
    stats: [], // Initialize empty stats - will be calculated separately
    trials: trials,
    maxEntriesPerDog: dbShow.max_entries_per_dog || undefined,
    maxTotalEntries: dbShow.max_total_entries || undefined,
    allowNonOwnerHandlers: dbShow.allow_non_owner_handlers || true,
    // TODO: Remove cast after regenerating Supabase types (run `supabase gen types`)
    confirmationMessage:
      ((dbShow as Record<string, unknown>).confirmation_message as string) || undefined,

    // Sync metadata for Local-First architecture
    _version: 1, // Default version
    _lastModified: new Date(dbShow.updated_at || dbShow.created_at || new Date().toISOString()),
    _lastModifiedBy: 'system', // Default value
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Maps array of DbShow to array of Show
 */
export const mapDatabaseShowsArray = (
  dbShows: (DbShow & {
    trial?: unknown[];
    trials?: unknown[];
    club?: unknown;
    judge_assignment?: unknown[];
    judge_assignments?: unknown[];
  })[]
): Show[] => {
  return dbShows.map(mapDatabaseToShow);
};

/**
 * Maps Show (from Zustand store) back to ShowInput for form editing
 */
export const mapShowToShowInput = (show: Show): ShowInput => {
  return {
    name: show.name,
    organization: show.organization,
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
    trials: show.trials,
    confirmationMessage: show.confirmationMessage,
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
    logger.warn('Failed to parse JSON:', 'mappers', {}, error as Error);
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

  if (!show.organization?.trim()) {
    errors.push('Organization is required');
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

  if (
    show.entryOpenDate &&
    show.entryCloseDate &&
    new Date(show.entryOpenDate) > new Date(show.entryCloseDate)
  ) {
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

  // Build full datetime defaults with sensible times
  const startDate = new Date(nextMonth);
  startDate.setHours(8, 0, 0, 0);

  const endDate = new Date(nextMonth);
  endDate.setHours(17, 0, 0, 0);

  const entryOpenDate = new Date(today);
  entryOpenDate.setHours(0, 0, 0, 0);

  const entryCloseDate = new Date(nextMonth.getTime() - 7 * 24 * 60 * 60 * 1000);
  entryCloseDate.setHours(23, 59, 0, 0);

  return {
    name: '',
    organization: 'AKC',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    location: '',
    status: 'upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    entryOpenDate: entryOpenDate.toISOString(),
    entryCloseDate: entryCloseDate.toISOString(),
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
    trials: [],
  };
};
