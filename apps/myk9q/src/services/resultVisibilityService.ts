/**
 * Result Visibility Service
 *
 * Handles granular control of what result fields (placement, qualification, time, faults)
 * are visible to stewards and exhibitors, and when they become visible.
 *
 * Key Rules:
 * - Judges and admins ALWAYS see all results (bypass all restrictions)
 * - Stewards and exhibitors subject to configured visibility rules
 * - Cascading inheritance: Show → Trial → Class (lowest level wins)
 * - Placement can never be 'immediate' (calculated only when class completes)
 */

import { supabase } from '../lib/supabase';
import type { UserRole } from '../utils/auth';
import { logger } from '@/utils/logger';
import type {
  VisibilityPreset,
  VisibilityTiming,
  VisibilitySettings,
  VisibleResultFields,
  ShowVisibilityDefault,
  TrialVisibilityOverride,
  ClassVisibilityOverride
} from '../types/visibility';

/**
 * Context for evaluating result field visibility
 * Groups related parameters for visibility determination
 */
export interface VisibilityEvaluationContext {
  classId: number;
  trialId: number;
  licenseKey: string;
  userRole: UserRole;
  isClassComplete: boolean;
  resultsReleasedAt: string | null;
}

/**
 * Resolve visibility settings for a specific class
 * Uses cascading inheritance: class override → trial override → show default
 *
 * @param classId - Class ID
 * @param trialId - Trial ID (for trial-level lookup)
 * @param licenseKey - Show license key (for show-level lookup)
 * @returns Complete visibility settings with inheritance info
 */
export async function getClassVisibilitySettings(
  classId: number,
  trialId: number,
  licenseKey: string
): Promise<VisibilitySettings> {
  try {
    // 1. Check class-level override (highest precedence)
    const { data: classOverride, error: classError } = await supabase
      .from('class_result_visibility_overrides')
      .select('*')
      .eq('class_id', classId)
      .maybeSingle();

    if (classError) {
      logger.error('Error fetching class visibility override:', classError);
    }

    if (classOverride) {
      return resolveSettings(classOverride, 'class');
    }

    // 2. Check trial-level override (medium precedence)
    const { data: trialOverride, error: trialError } = await supabase
      .from('trial_result_visibility_overrides')
      .select('*')
      .eq('trial_id', trialId)
      .maybeSingle();

    if (trialError) {
      logger.error('Error fetching trial visibility override:', trialError);
    }

    if (trialOverride) {
      return resolveSettings(trialOverride, 'trial');
    }

    // 3. Fall back to show-level default (lowest precedence)
    const { data: showDefault, error: showError } = await supabase
      .from('show_result_visibility_defaults')
      .select('*')
      .eq('license_key', licenseKey)
      .maybeSingle();

    if (showError) {
      logger.error('Error fetching show visibility default:', showError);
    }

    if (showDefault) {
      return resolveSettings(showDefault, 'show');
    }

    // Ultimate fallback: standard preset if nothing configured
    logger.warn(`No visibility settings found for class ${classId}, using standard preset`);
    return resolvePreset('standard', 'show');
  } catch (error) {
    logger.error('Error in getClassVisibilitySettings:', error);
    // Safe fallback: standard preset
    return resolvePreset('standard', 'show');
  }
}

/**
 * Resolve database row to VisibilitySettings
 * Handles preset resolution and granular field overrides
 *
 * @param row - Database row (show/trial/class visibility config)
 * @param source - Where the settings came from
 * @returns Resolved visibility settings
 */
function resolveSettings(
  row: ShowVisibilityDefault | TrialVisibilityOverride | ClassVisibilityOverride,
  source: 'show' | 'trial' | 'class'
): VisibilitySettings {
  // If preset is defined, use it as base
  if (row.preset_name) {
    const presetSettings = resolvePreset(row.preset_name, source);

    // Apply granular overrides if specified (NULL means use preset value)
    return {
      placement: row.placement_timing || presetSettings.placement,
      qualification: row.qualification_timing || presetSettings.qualification,
      time: row.time_timing || presetSettings.time,
      faults: row.faults_timing || presetSettings.faults,
      inheritedFrom: source,
      preset: row.preset_name
    };
  }

  // Granular only (no preset) - use field values or safe defaults
  return {
    placement: row.placement_timing || 'class_complete',
    qualification: row.qualification_timing || 'immediate',
    time: row.time_timing || 'class_complete',
    faults: row.faults_timing || 'class_complete',
    inheritedFrom: source
  };
}

/**
 * Convert preset name to specific field timings
 *
 * @param preset - Preset name
 * @param source - Where the preset is being applied
 * @returns Complete visibility settings for the preset
 */
function resolvePreset(
  preset: VisibilityPreset,
  source: 'show' | 'trial' | 'class'
): VisibilitySettings {
  const presets: Record<VisibilityPreset, VisibilitySettings> = {
    open: {
      placement: 'class_complete', // Can't be immediate (calculated when class completes)
      qualification: 'immediate',
      time: 'immediate',
      faults: 'immediate',
      inheritedFrom: source,
      preset: 'open'
    },
    standard: {
      placement: 'class_complete',
      qualification: 'immediate',
      time: 'class_complete',
      faults: 'class_complete',
      inheritedFrom: source,
      preset: 'standard'
    },
    review: {
      placement: 'manual_release',
      qualification: 'manual_release',
      time: 'manual_release',
      faults: 'manual_release',
      inheritedFrom: source,
      preset: 'review'
    }
  };

  return presets[preset];
}

/**
 * Determine which result fields should be visible to a specific user
 *
 * IMPORTANT: Judges and admins ALWAYS see all fields regardless of settings
 * Stewards and exhibitors subject to configured visibility rules
 *
 * @param ctx - Visibility evaluation context containing class, trial, user, and state info
 * @returns Flags indicating which fields should be shown
 */
export async function getVisibleResultFields(
  ctx: VisibilityEvaluationContext
): Promise<VisibleResultFields> {
  const { classId, trialId, licenseKey, userRole, isClassComplete, resultsReleasedAt } = ctx;

  // Judges and admins bypass all restrictions - they always see everything
  if (userRole === 'admin' || userRole === 'judge') {
    return {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true
    };
  }

  // Get visibility settings for this class
  const settings = await getClassVisibilitySettings(classId, trialId, licenseKey);

  // Determine visibility for each field based on timing rules
  return {
    showPlacement: shouldShowField(settings.placement, isClassComplete, resultsReleasedAt),
    showQualification: shouldShowField(settings.qualification, isClassComplete, resultsReleasedAt),
    showTime: shouldShowField(settings.time, isClassComplete, resultsReleasedAt),
    showFaults: shouldShowField(settings.faults, isClassComplete, resultsReleasedAt)
  };
}

/**
 * Check if a specific field should be visible based on timing setting
 *
 * @param timing - When field becomes visible
 * @param isClassComplete - Whether class has finished
 * @param resultsReleasedAt - Manual release timestamp (null if not released)
 * @returns True if field should be visible
 */
function shouldShowField(
  timing: VisibilityTiming,
  isClassComplete: boolean,
  resultsReleasedAt: string | null
): boolean {
  switch (timing) {
    case 'immediate':
      return true; // Always visible as soon as scored

    case 'class_complete':
      return isClassComplete; // Visible only after class finishes

    case 'manual_release':
      return resultsReleasedAt !== null; // Visible only after admin manually releases

    default:
      return false; // Safe default: hide
  }
}

/**
 * Set visibility preset for entire show (all classes inherit unless overridden)
 *
 * @param licenseKey - Show license key
 * @param preset - Preset to apply
 * @param adminName - Admin name for audit trail
 */
export async function setShowVisibility(
  licenseKey: string,
  preset: VisibilityPreset,
  adminName: string
): Promise<void> {
  const { error } = await supabase
    .from('show_result_visibility_defaults')
    .upsert({
      license_key: licenseKey,
      preset_name: preset,
      // Clear granular overrides when setting preset
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      updated_by: adminName,
      updated_at: new Date().toISOString()
    });

  if (error) {
    logger.error('Error setting show visibility:', error);
    throw error;
  }
}

/**
 * Set visibility override for specific trial
 * Classes in this trial inherit this setting unless they have their own override
 *
 * @param trialId - Trial ID
 * @param preset - Preset to apply
 * @param adminName - Admin name for audit trail
 */
export async function setTrialVisibility(
  trialId: number,
  preset: VisibilityPreset,
  adminName: string
): Promise<void> {
  const { error } = await supabase
    .from('trial_result_visibility_overrides')
    .upsert({
      trial_id: trialId,
      preset_name: preset,
      // Clear granular overrides when setting preset
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      updated_by: adminName,
      updated_at: new Date().toISOString()
    });

  if (error) {
    logger.error('Error setting trial visibility:', error);
    throw error;
  }
}

/**
 * Set visibility override for specific class
 * Highest precedence - overrides both trial and show settings
 *
 * @param classId - Class ID
 * @param preset - Preset to apply
 * @param adminName - Admin name for audit trail
 */
export async function setClassVisibility(
  classId: number,
  preset: VisibilityPreset,
  adminName: string
): Promise<void> {
  const { error } = await supabase
    .from('class_result_visibility_overrides')
    .upsert({
      class_id: classId,
      preset_name: preset,
      // Clear granular overrides when setting preset
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      updated_by: adminName,
      updated_at: new Date().toISOString()
    });

  if (error) {
    logger.error('Error setting class visibility:', error);
    throw error;
  }
}

/**
 * Remove trial override (classes fall back to show default)
 *
 * @param trialId - Trial ID
 */
export async function removeTrialVisibilityOverride(trialId: number): Promise<void> {
  const { error } = await supabase
    .from('trial_result_visibility_overrides')
    .delete()
    .eq('trial_id', trialId);

  if (error) {
    logger.error('Error removing trial visibility override:', error);
    throw error;
  }
}

/**
 * Remove class override (class falls back to trial/show settings)
 *
 * @param classId - Class ID
 */
export async function removeClassVisibilityOverride(classId: number): Promise<void> {
  const { error } = await supabase
    .from('class_result_visibility_overrides')
    .delete()
    .eq('class_id', classId);

  if (error) {
    logger.error('Error removing class visibility override:', error);
    throw error;
  }
}

/**
 * Bulk apply preset to multiple classes
 *
 * @param classIds - Array of class IDs
 * @param preset - Preset to apply
 * @param adminName - Admin name for audit trail
 */
export async function bulkSetClassVisibility(
  classIds: number[],
  preset: VisibilityPreset,
  adminName: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  const updates = classIds.map(classId => ({
    class_id: classId,
    preset_name: preset,
    placement_timing: null,
    qualification_timing: null,
    time_timing: null,
    faults_timing: null,
    updated_by: adminName,
    updated_at: timestamp
  }));

  const { error } = await supabase
    .from('class_result_visibility_overrides')
    .upsert(updates);

  if (error) {
    logger.error('Error bulk setting class visibility:', error);
    throw error;
  }
}

/**
 * Get availability message for hidden field
 * Explains to user when field will become available
 *
 * @param isClassComplete - Whether class has finished
 * @param timing - Field's visibility timing
 * @returns Human-readable availability message
 */
export function getAvailabilityMessage(
  isClassComplete: boolean,
  timing: VisibilityTiming
): string {
  if (timing === 'immediate') {
    return ''; // Shouldn't happen for hidden fields
  }

  if (timing === 'class_complete') {
    return isClassComplete ? 'Available soon' : 'Available when class completes';
  }

  if (timing === 'manual_release') {
    return isClassComplete ? 'Pending official release' : 'Pending release';
  }

  return 'Not available';
}

// ============================================================
// SELF CHECK-IN CASCADE FUNCTIONS
// ============================================================

/**
 * Get effective self check-in setting for a class
 * Uses cascading inheritance: class → trial → show → default TRUE
 *
 * @param classId - Class ID
 * @param trialId - Trial ID
 * @param licenseKey - Show license key
 * @returns Whether self check-in is enabled
 */
export async function getEffectiveSelfCheckin(
  classId: number,
  trialId: number,
  licenseKey: string
): Promise<boolean> {
  try {
    // 1. Check class-level setting (highest precedence)
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('self_checkin_enabled')
      .eq('id', classId)
      .single();

    if (classError) {
      logger.error('Error fetching class self check-in setting:', classError);
    }

    if (classData?.self_checkin_enabled !== null && classData?.self_checkin_enabled !== undefined) {
      return classData.self_checkin_enabled;
    }

    // 2. Check trial-level setting (medium precedence)
    const { data: trialData, error: trialError } = await supabase
      .from('trials')
      .select('self_checkin_enabled')
      .eq('id', trialId)
      .single();

    if (trialError) {
      logger.error('Error fetching trial self check-in setting:', trialError);
    }

    if (trialData?.self_checkin_enabled !== null && trialData?.self_checkin_enabled !== undefined) {
      return trialData.self_checkin_enabled;
    }

    // 3. Check show-level setting (lowest precedence)
    const { data: showData, error: showError } = await supabase
      .from('shows')
      .select('self_checkin_enabled')
      .eq('license_key', licenseKey)
      .single();

    if (showError) {
      logger.error('Error fetching show self check-in setting:', showError);
    }

    // Default to TRUE if show setting is null/undefined
    return showData?.self_checkin_enabled ?? true;
  } catch (error) {
    logger.error('Error in getEffectiveSelfCheckin:', error);
    return true; // Safe default
  }
}

/**
 * Set show-level self check-in default
 *
 * @param licenseKey - Show license key
 * @param enabled - Whether self check-in is enabled
 */
export async function setShowSelfCheckin(
  licenseKey: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('shows')
    .update({ self_checkin_enabled: enabled })
    .eq('license_key', licenseKey);

  if (error) {
    logger.error('Error setting show self check-in:', error);
    throw error;
  }
}

/**
 * Set trial-level self check-in override
 *
 * @param trialId - Trial ID
 * @param enabled - Whether self check-in is enabled (null to remove override)
 */
export async function setTrialSelfCheckin(
  trialId: number,
  enabled: boolean | null
): Promise<void> {
  const { error } = await supabase
    .from('trials')
    .update({ self_checkin_enabled: enabled })
    .eq('id', trialId);

  if (error) {
    logger.error('Error setting trial self check-in:', error);
    throw error;
  }
}

/**
 * Remove trial-level self check-in override (inherit from show)
 *
 * @param trialId - Trial ID
 */
export async function removeTrialSelfCheckinOverride(
  trialId: number
): Promise<void> {
  await setTrialSelfCheckin(trialId, null);
}

/**
 * Set class-level self check-in override
 *
 * @param classId - Class ID
 * @param enabled - Whether self check-in is enabled (null to remove override)
 */
export async function setClassSelfCheckin(
  classId: number,
  enabled: boolean | null
): Promise<void> {
  const { error } = await supabase
    .from('classes')
    .update({ self_checkin_enabled: enabled })
    .eq('id', classId);

  if (error) {
    logger.error('Error setting class self check-in:', error);
    throw error;
  }
}

/**
 * Bulk set self check-in for multiple classes
 *
 * @param classIds - Array of class IDs
 * @param enabled - Whether self check-in is enabled
 */
export async function bulkSetClassSelfCheckin(
  classIds: number[],
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('classes')
    .update({ self_checkin_enabled: enabled })
    .in('id', classIds);

  if (error) {
    logger.error('Error bulk setting class self check-in:', error);
    throw error;
  }
}
