/**
 * Placement Calculation Service
 *
 * Calculates placements for Regular shows and Nationals based on:
 * - Regular: Qualified > Lowest Faults > Fastest Time
 * - Nationals: Qualified > Highest Points > Fastest Time
 */

import { supabase } from '../lib/supabase';
import { logger } from '@/utils/logger';

/** Nested show data from joined query */
interface NestedShow {
  license_key: string;
  show_type?: string;
}

/** Nested trial data with shows from joined query */
interface NestedTrial {
  show_id: number;
  shows: NestedShow;
}

/**
 * Recalculate all placements for one or more classes using database function
 *
 * @param classIds - Single class ID or array of class IDs to recalculate placements for
 * @param licenseKey - The license key for tenant isolation (unused but kept for API compatibility)
 * @param isNationals - Whether this is a Nationals competition
 */
export async function recalculatePlacementsForClass(
  classIds: number | number[],
  licenseKey: string,
  isNationals: boolean = false
): Promise<void> {
  try {
    // Normalize to array for consistent handling
    const classIdArray = Array.isArray(classIds) ? classIds : [classIds];

    // Call the database function to recalculate placements for each class
    // Note: Placements are calculated separately per class, even for combined Novice A & B
    // This is much faster than the old client-side approach as it:
    // 1. Uses SQL window functions for efficient ranking
    // 2. Updates all placements in batch operations
    // 3. Avoids N+1 queries
    const { error } = await supabase.rpc('recalculate_class_placements', {
      p_class_ids: classIdArray,
      p_is_nationals: isNationals
    });

    if (error) {
      logger.error('Error recalculating placements:', error);
      throw error;
    }

} catch (error) {
    logger.error('Error recalculating placements:', error);
    throw error;
  }
}

/**
 * Get the current placement for a specific entry
 */
export async function getEntryPlacement(
  entryId: number
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('entries')
      .select('final_placement')
      .eq('id', entryId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.final_placement;
  } catch (error) {
    logger.error('Error getting entry placement:', error);
    return null;
  }
}

/**
 * Manually recalculate placements for a class (triggered by user)
 * Used by judges/admins to refresh placements mid-class if needed
 */
export async function manuallyRecalculatePlacements(
  classId: number
): Promise<void> {
  try {
// Get class data including show info
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        trial_id,
        trials!inner (
          show_id,
          shows!inner (
            license_key,
            show_type
          )
        )
      `)
      .eq('id', classId)
      .single();

    if (classError || !classData) {
      throw new Error(`Failed to fetch class data: ${classError?.message}`);
    }

    const trial = classData.trials as unknown as NestedTrial;
    const show = trial.shows;
    const licenseKey = show.license_key;
    const isNationals = show.show_type?.toLowerCase().includes('national') || false;

    await recalculatePlacementsForClass(classId, licenseKey, isNationals);
} catch (error) {
    logger.error('Error in manual placement recalculation:', error);
    throw error;
  }
}