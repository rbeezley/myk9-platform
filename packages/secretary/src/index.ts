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
} from './visibility/visibility-types';

// Visibility presets
export { PRESET_CONFIGS, PRESET_INFO, resolvePreset } from './visibility/visibility-presets';
