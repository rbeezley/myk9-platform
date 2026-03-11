/**
 * Visibility Type Definitions
 *
 * Shared between myK9Show and myK9Q. Field names use short form
 * (placement, qualification, time, faults) — DB columns use _timing
 * suffix; each app's adapter maps between them.
 */

/** When a result field becomes visible to stewards/exhibitors */
export type VisibilityTiming = 'immediate' | 'class_complete' | 'manual_release';

/** Quick-apply preset templates */
export type VisibilityPreset = 'open' | 'standard' | 'review';

/** Result fields that can be controlled */
export type ResultField = 'placement' | 'qualification' | 'time' | 'faults';

/** Complete visibility configuration for a class (all fields resolved, no nulls) */
export interface VisibilitySettings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
  inheritedFrom?: 'show' | 'trial' | 'class';
  preset?: VisibilityPreset;
}

/** Computed per-user visibility flags (output of getVisibleResultFields) */
export interface VisibleResultFields {
  showPlacement: boolean;
  showQualification: boolean;
  showTime: boolean;
  showFaults: boolean;
}

/** Class completion state for visibility evaluation */
export type ClassState = 'in_progress' | 'completed' | 'released';

/** User roles for visibility bypass logic */
export type VisibilityUserRole = 'judge' | 'admin' | 'secretary' | 'steward' | 'exhibitor';

/** Nullable override row — null means inherit from parent level */
export interface VisibilityOverride {
  preset?: VisibilityPreset | null;
  placement?: VisibilityTiming | null;
  qualification?: VisibilityTiming | null;
  time?: VisibilityTiming | null;
  faults?: VisibilityTiming | null;
}

/** UI metadata for preset cards — each app can extend with icons/styling */
export interface PresetInfo {
  preset: VisibilityPreset;
  title: string;
  description: string;
  details: string;
}
