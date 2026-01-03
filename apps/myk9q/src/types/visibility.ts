/**
 * Result Visibility Type Definitions
 *
 * Defines types for the granular result visibility control system.
 * Controls WHAT result fields are visible and WHEN they become visible
 * to stewards and exhibitors. Judges and admins always see all results.
 */

/**
 * Quick-apply preset templates
 */
export type VisibilityPreset = 'open' | 'standard' | 'review';

/**
 * When a result field becomes visible to stewards/exhibitors
 */
export type VisibilityTiming = 'immediate' | 'class_complete' | 'manual_release';

/**
 * Result fields that can be controlled
 */
export type ResultField = 'placement' | 'qualification' | 'time' | 'faults';

/**
 * Complete visibility configuration for a class
 */
export interface VisibilitySettings {
  /** When placement (trophy/position) becomes visible */
  placement: VisibilityTiming;

  /** When qualification status (Q/NQ/Absent) becomes visible */
  qualification: VisibilityTiming;

  /** When search time becomes visible */
  time: VisibilityTiming;

  /** When fault count becomes visible */
  faults: VisibilityTiming;

  /** Where these settings came from (for UI display) */
  inheritedFrom?: 'show' | 'trial' | 'class';

  /** Preset name if using a preset */
  preset?: VisibilityPreset;
}

/**
 * Computed visibility flags for a specific user/class combination
 */
export interface VisibleResultFields {
  /** Should placement be shown to this user */
  showPlacement: boolean;

  /** Should qualification status be shown to this user */
  showQualification: boolean;

  /** Should search time be shown to this user */
  showTime: boolean;

  /** Should fault count be shown to this user */
  showFaults: boolean;
}

/**
 * Database row from show_result_visibility_defaults
 */
export interface ShowVisibilityDefault {
  license_key: string;
  preset_name: VisibilityPreset;
  placement_timing: VisibilityTiming | null;
  qualification_timing: VisibilityTiming | null;
  time_timing: VisibilityTiming | null;
  faults_timing: VisibilityTiming | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Database row from trial_result_visibility_overrides
 */
export interface TrialVisibilityOverride {
  trial_id: number;
  preset_name: VisibilityPreset | null;
  placement_timing: VisibilityTiming | null;
  qualification_timing: VisibilityTiming | null;
  time_timing: VisibilityTiming | null;
  faults_timing: VisibilityTiming | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Database row from class_result_visibility_overrides
 */
export interface ClassVisibilityOverride {
  class_id: number;
  preset_name: VisibilityPreset | null;
  placement_timing: VisibilityTiming | null;
  qualification_timing: VisibilityTiming | null;
  time_timing: VisibilityTiming | null;
  faults_timing: VisibilityTiming | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Preset metadata for UI display
 */
export interface PresetInfo {
  preset: VisibilityPreset;
  icon: string;
  title: string;
  description: string;
  details: string;
}

/**
 * Preset configuration constants
 */
export const PRESET_CONFIGS: Record<VisibilityPreset, PresetInfo> = {
  open: {
    preset: 'open',
    icon: '⚡',
    title: 'Immediately',
    description: 'Show results immediately as dogs run',
    details: 'Q/NQ, Time, Faults visible right away. Placement when class completes.'
  },
  standard: {
    preset: 'standard',
    icon: '⏱️',
    title: 'After Class',
    description: 'Show Q/NQ immediately, rest when class completes',
    details: 'Q/NQ visible as scored. Time, Faults, Placement when class finishes.'
  },
  review: {
    preset: 'review',
    icon: '🔒',
    title: 'After Review',
    description: 'Judge must approve before results are visible',
    details: 'All results hidden until you click "Release Results" button.'
  }
};
