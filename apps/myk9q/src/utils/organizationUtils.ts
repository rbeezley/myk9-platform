/**
 * Organization utility functions for myK9Q application
 */

import { supabase } from '../lib/supabase';
import { logger } from './logger';

export interface OrganizationData {
  organization: string;
  activity_type: string;
}

export interface FixedTimeResult {
  applied: boolean;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  error?: string;
}

/**
 * Parse organization string to extract organization and activity type
 * @param orgString - Organization string like "AKC Scent Work", "UKC Obedience"
 * @returns Object with organization and activity_type
 * @example
 * parseOrganizationData("AKC Scent Work") // { organization: "AKC", activity_type: "Scent Work" }
 * parseOrganizationData("UKC Obedience") // { organization: "UKC", activity_type: "Obedience" }
 */
export const parseOrganizationData = (orgString: string): OrganizationData => {
  if (!orgString || orgString.trim() === '') {
    // Default to AKC Scent Work for this show based on the user's report
    return {
      organization: 'AKC',
      activity_type: 'Scent Work'
    };
  }

  // Parse organization string like "UKC Obedience", "AKC Scent Work"
  const parts = orgString.split(' ');
  const result = {
    organization: parts[0], // "UKC", "AKC", "ASCA"
    activity_type: parts.slice(1).join(' '), // "Obedience", "Scent Work", "FastCat"
  };

  return result;
};

/**
 * Check if max times are rule-defined (not settable by judges)
 * Some organizations/activities have fixed max times in their rules,
 * so the "Set Max Time" option should be hidden.
 *
 * Currently applies to:
 * - ASCA (all activities) - fixed max times per level
 * - UKC Nosework - fixed max times per level (3/4/5/6/6 min for Novice through Elite)
 *
 * Note: This is used for UI decisions (hiding "Set Max Time" button).
 * The actual fixed time data comes from class_requirements.time_limit_seconds.
 */
export const hasRuleDefinedMaxTimes = (orgData: OrganizationData): boolean => {
  // ASCA has rule-defined max times for all activities
  if (orgData.organization === 'ASCA') {
    return true;
  }

  // UKC Nosework has fixed max times per level
  if (orgData.organization === 'UKC' && orgData.activity_type.toLowerCase().includes('nosework')) {
    return true;
  }

  return false;
};

/**
 * Try to apply fixed max time from class_requirements.
 * This is the data-driven approach - if time_limit_seconds exists in the DB, apply it.
 * Works for any organization where fixed times are defined.
 *
 * @returns FixedTimeResult with applied=true if time was applied, false otherwise
 */
export const tryApplyFixedMaxTime = async (
  classId: number,
  organization: string,
  element: string,
  level: string
): Promise<FixedTimeResult> => {
  // First check if fixed time exists in database
  const fixedTime = await getFixedMaxTime(organization, element, level);

  if (!fixedTime) {
    return { applied: false, error: 'No fixed time in database' };
  }

  // Apply the fixed time to the class
  return applyFixedMaxTime(classId, organization, element, level);
};

/**
 * Fetch and apply fixed max time from class_requirements to a class.
 * This is for organizations that have rule-defined fixed times (ASCA, UKC).
 *
 * @param classId - The class ID to update
 * @param organization - The organization code (AKC, UKC, ASCA)
 * @param element - The element (Interior, Exterior, Container, etc.)
 * @param level - The level (Novice, Advanced, etc.)
 * @returns Object with applied status and time values
 */
export const applyFixedMaxTime = async (
  classId: number,
  organization: string,
  element: string,
  level: string
): Promise<FixedTimeResult> => {
  try {
    // Look up the fixed time from class_requirements
    const { data: requirements, error: reqError } = await supabase
      .from('class_requirements')
      .select('time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds')
      .eq('organization', organization)
      .eq('element', element)
      .eq('level', level)
      .single();

    if (reqError || !requirements) {
      logger.warn(`⚠️ No class requirements found for ${organization} ${element} ${level}`);
      return { applied: false, error: 'No requirements found' };
    }

    // Only apply if time_limit_seconds is defined (fixed time)
    if (!requirements.time_limit_seconds) {
      return { applied: false, error: 'No fixed time defined' };
    }

    // Update the class with the fixed time
    const updateData: Record<string, number> = {
      time_limit_seconds: requirements.time_limit_seconds
    };

    // Include area 2 and 3 times if defined
    if (requirements.time_limit_area2_seconds) {
      updateData.time_limit_area2_seconds = requirements.time_limit_area2_seconds;
    }
    if (requirements.time_limit_area3_seconds) {
      updateData.time_limit_area3_seconds = requirements.time_limit_area3_seconds;
    }

    const { error: updateError } = await supabase
      .from('classes')
      .update(updateData)
      .eq('id', classId);

    if (updateError) {
      logger.error('❌ Error applying fixed max time:', updateError);
      return { applied: false, error: updateError.message };
    }

    logger.info(`✅ Applied fixed max time to class ${classId}: ${requirements.time_limit_seconds}s`);

    return {
      applied: true,
      time_limit_seconds: requirements.time_limit_seconds,
      time_limit_area2_seconds: requirements.time_limit_area2_seconds ?? undefined,
      time_limit_area3_seconds: requirements.time_limit_area3_seconds ?? undefined
    };
  } catch (error) {
    logger.error('💥 Error in applyFixedMaxTime:', error);
    return { applied: false, error: String(error) };
  }
};

/**
 * Check if a class has a fixed time defined in class_requirements.
 * Returns the fixed time values if found, null otherwise.
 */
export const getFixedMaxTime = async (
  organization: string,
  element: string,
  level: string
): Promise<{ time_limit_seconds: number; time_limit_area2_seconds?: number; time_limit_area3_seconds?: number } | null> => {
  try {
    const { data, error } = await supabase
      .from('class_requirements')
      .select('time_limit_seconds, time_limit_area2_seconds, time_limit_area3_seconds')
      .eq('organization', organization)
      .eq('element', element)
      .eq('level', level)
      .single();

    if (error || !data || !data.time_limit_seconds) {
      return null;
    }

    return {
      time_limit_seconds: data.time_limit_seconds,
      time_limit_area2_seconds: data.time_limit_area2_seconds ?? undefined,
      time_limit_area3_seconds: data.time_limit_area3_seconds ?? undefined
    };
  } catch {
    return null;
  }
};
