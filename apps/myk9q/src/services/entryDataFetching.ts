import { supabase } from '../lib/supabase';
import { Entry } from '../stores/entryStore';
import { buildClassName } from '@/utils/stringUtils';
import { formatTimeLimitSeconds } from '@/utils/timeUtils';
import { determineEntryStatus } from '@/utils/statusUtils';
import { mapDatabaseRowToEntry } from '@/utils/entryMappers';
import { logger } from '@/utils/logger';

/**
 * Entry Data Fetching Module
 *
 * Handles all Supabase database queries for fetching entry data.
 * This provides a clean separation between data fetching and business logic.
 *
 * **Extracted from**: entryService.ts
 * **Purpose**: Isolate database access layer from service logic
 */

/**
 * Fetch class entries from Supabase (fallback when cache is unavailable)
 *
 * @param classIdArray - Array of class IDs to fetch entries for
 * @param primaryClassId - The primary class ID (first in array)
 * @param licenseKey - License key for tenant isolation
 * @returns Entry[] from database
 */
export async function fetchClassEntriesFromDatabase(
  classIdArray: number[],
  primaryClassId: number,
  licenseKey: string
): Promise<Entry[]> {
// Get class data to determine element, level, section for filtering
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('element, level, section, area_count, time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds')
    .eq('id', primaryClassId)
    .single();

  if (classError || !classData) {
    logger.error('Error fetching class data:', classError);
    throw new Error('Could not find class');
  }

  // Use view_entry_with_results for pre-joined data (entries + results in one query)
  const { data: viewData, error: viewError } = await supabase
    .from('view_entry_with_results')
    .select(`
      *,
      classes!inner (
        element,
        level,
        section,
        trials!inner (
          trial_date,
          trial_number,
          shows!inner (
            license_key
          )
        )
      )
    `)
    .in('class_id', classIdArray)
    .eq('classes.trials.shows.license_key', licenseKey)
    .order('armband_number', { ascending: true });

  if (viewError) {
    logger.error('Error fetching class entries from view:', viewError);
    throw viewError;
  }

  if (!viewData || viewData.length === 0) {
    return [];
  }

  // Map view columns to Entry interface (results already pre-joined in view)
  const mappedEntries = viewData.map(row => {
    // Determine unified status using entry_status from view
    const status = determineEntryStatus(row.entry_status);

    return {
      id: row.id,
      armband: row.armband_number,
      callName: row.dog_call_name,
      breed: row.dog_breed,
      handler: row.handler_name,
      jumpHeight: '', // Not in normalized schema yet
      preferredTime: '', // Not in normalized schema yet
      isScored: row.is_scored || false,

      // New unified status field
      status,

      // Deprecated fields (backward compatibility)
      inRing: status === 'in-ring',
      checkedIn: status !== 'no-status',
      checkinStatus: status,

      resultText: row.result_status || 'pending',
      searchTime: row.search_time_seconds?.toString() || '0.00',
      faultCount: row.total_faults || 0,
      placement: row.final_placement ?? undefined,
      correctFinds: row.total_correct_finds || 0,
      incorrectFinds: row.total_incorrect_finds || 0,
      noFinishCount: row.no_finish_count || 0,
      totalPoints: row.points_earned || 0,
      nqReason: row.disqualification_reason || undefined,
      excusedReason: row.excuse_reason || undefined,
      withdrawnReason: row.withdrawal_reason || undefined,
      classId: row.class_id,
      className: buildClassName(row.classes.element, row.classes.level, row.classes.section),
      section: row.classes.section,
      element: row.classes.element,
      level: row.classes.level,
      timeLimit: formatTimeLimitSeconds(classData.time_limit_seconds),
      timeLimit2: formatTimeLimitSeconds(classData.time_limit_area2_seconds),
      timeLimit3: formatTimeLimitSeconds(classData.time_limit_area3_seconds),
      areas: classData.area_count,
      exhibitorOrder: row.exhibitor_order,
      actualClassId: row.class_id,
      trialDate: row.classes.trials.trial_date,
      trialNumber: row.classes.trials.trial_number.toString()
    };
  });

return mappedEntries;
}

/**
 * Fetch entries for a specific trial from database
 *
 * @param trialId - Trial ID to fetch entries for
 * @param licenseKey - License key for tenant isolation
 * @returns Entry[] for the trial
 */
export async function fetchTrialEntriesFromDatabase(
  trialId: number,
  licenseKey: string
): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(`
      *,
      classes!inner (
        element,
        level,
        section,
        trials!inner (
          trial_date,
          trial_number,
          shows!inner (
            license_key
          )
        )
      )
    `)
    .eq('classes.trials.shows.license_key', licenseKey)
    .eq('classes.trials.id', trialId)
    .order('classes.element', { ascending: true })
    .order('armband', { ascending: true });

  if (error) {
    logger.error('Error fetching trial entries:', error);
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map(row => {
    // Get result if exists
    const result = row.results?.[0];

    // Determine status and className for Entry mapping
    const status = determineEntryStatus(row.entry_status, result?.is_in_ring);
    const className = buildClassName(row.element, row.level, row.section);

    // Use utility mapper for consistent Entry object creation
    return mapDatabaseRowToEntry(row, status, className);
  });
}

/**
 * Fetch entries by armband number across all classes
 *
 * @param armband - Armband number to search for
 * @param licenseKey - License key for tenant isolation
 * @returns Entry[] matching the armband
 */
export async function fetchEntriesByArmbandFromDatabase(
  armband: number,
  licenseKey: string
): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(`
      *,
      classes!inner (
        element,
        level,
        section,
        trials!inner (
          trial_date,
          trial_number,
          shows!inner (
            license_key
          )
        )
      )
    `)
    .eq('classes.trials.shows.license_key', licenseKey)
    .eq('armband', armband)
    .order('classes.element', { ascending: true });

  if (error) {
    logger.error('Error fetching entries by armband:', error);
    throw error;
  }

  if (!data) {
    return [];
  }

  return data.map(row => {
    // Get result if exists
    const result = row.results?.[0];

    // Determine status and className for Entry mapping
    const status = determineEntryStatus(row.entry_status, result?.is_in_ring);
    const className = buildClassName(row.element, row.level, row.section);

    // Use utility mapper for consistent Entry object creation
    return mapDatabaseRowToEntry(row, status, className);
  });
}
