/**
 * @myk9/secretary — Secretary tools package
 *
 * Pure types and cascade resolution logic for:
 * - Results visibility (show → trial → class cascade with presets)
 * - Self check-in (show → trial → class cascade)
 */

// Visibility types
export type {
  VisibilityTiming,
  VisibilityPreset,
  ResultField,
  VisibilitySettings,
  VisibleResultFields,
  ClassState,
  VisibilityUserRole,
  VisibilityOverride,
  PresetInfo,
  FieldTimings,
} from './visibility/visibility-types';

// Visibility presets
export {
  PRESET_CONFIGS,
  PRESET_INFO,
  resolvePreset,
  fieldTimingsFromVisibility,
  detectPreset,
  hasVisibilityOverride,
} from './visibility/visibility-presets';

// Visibility cascade
export { resolveVisibilityCascade, getVisibleResultFields } from './visibility/visibility-cascade';

// Check-in cascade
export { resolveCheckinCascade } from './checkin/checkin-cascade';

// Results submission — types, registry, and built-in formatters
export type {
  SubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
  SubmissionData,
  ResultFormatter,
  AKCOwnerAddress,
  AKCSubmissionEntry,
  AKCSubmissionData,
} from './results';
export {
  registerFormatter,
  getFormatter,
  listFormatters,
  clearFormatters,
  AKCScentWorkFormatter,
} from './results';
