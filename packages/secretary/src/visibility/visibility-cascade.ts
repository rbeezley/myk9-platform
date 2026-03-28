import type {
  VisibilitySettings,
  VisibilityOverride,
  VisibleResultFields,
  VisibilityTiming,
  ClassState,
  VisibilityUserRole,
} from './visibility-types';
import { PRESET_CONFIGS } from './visibility-presets';

const RESULT_FIELDS = ['placement', 'qualification', 'time', 'faults'] as const;

/**
 * Resolve the visibility cascade: show → trial → class.
 *
 * Each level's non-null fields override the parent. If a level specifies
 * a preset, the preset fields are applied first, then per-field overrides
 * at that level take precedence over the preset.
 *
 * @param show - Show-level settings (fully resolved, no nulls)
 * @param trial - Trial-level overrides (nullable fields = inherit)
 * @param cls - Class-level overrides (nullable fields = inherit)
 */
export function resolveVisibilityCascade(
  show: VisibilitySettings,
  trial?: VisibilityOverride,
  cls?: VisibilityOverride
): VisibilitySettings {
  let result: VisibilitySettings = { ...show };

  if (trial) {
    result = applyOverride(result, trial, 'trial');
  }

  if (cls) {
    result = applyOverride(result, cls, 'class');
  }

  return result;
}

/**
 * Apply an override layer on top of current settings.
 * Preset is applied first as base, then per-field overrides win.
 */
function applyOverride(
  base: VisibilitySettings,
  override: VisibilityOverride,
  source: 'trial' | 'class'
): VisibilitySettings {
  // Check if override has any non-null values
  const hasPreset = override.preset != null;
  const hasFieldOverrides = RESULT_FIELDS.some(f => override[f] != null);

  if (!hasPreset && !hasFieldOverrides) {
    return base; // All null = full inherit
  }

  // Start from base
  const result: VisibilitySettings = { ...base, inheritedFrom: source };

  // If preset specified, apply preset as new base
  if (hasPreset) {
    const presetConfig = PRESET_CONFIGS[override.preset!];
    for (const field of RESULT_FIELDS) {
      result[field] = presetConfig[field];
    }
    result.preset = override.preset!;
  }

  // Per-field overrides win over preset
  for (const field of RESULT_FIELDS) {
    if (override[field] != null) {
      result[field] = override[field]!;
    }
  }

  return result;
}

/**
 * Determine which result fields should be visible to a specific user.
 *
 * Judges and admins ALWAYS see all fields (bypass all restrictions).
 * All other roles are subject to configured visibility rules.
 *
 * @param settings - Resolved visibility settings for this class
 * @param classState - Current state of the class
 * @param userRole - Role of the user viewing results
 */
export function getVisibleResultFields(
  settings: VisibilitySettings,
  classState: ClassState,
  userRole: VisibilityUserRole
): VisibleResultFields {
  // Staff bypass all restrictions — they need to see results to manage them
  if (userRole === 'judge' || userRole === 'admin' || userRole === 'secretary') {
    return {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    };
  }

  return {
    showPlacement: shouldShowField(settings.placement, classState),
    showQualification: shouldShowField(settings.qualification, classState),
    showTime: shouldShowField(settings.time, classState),
    showFaults: shouldShowField(settings.faults, classState),
  };
}

/**
 * Check if a specific field should be visible based on timing and class state.
 */
function shouldShowField(timing: VisibilityTiming, classState: ClassState): boolean {
  switch (timing) {
    case 'immediate':
      return true;
    case 'class_complete':
      return classState === 'completed' || classState === 'released';
    case 'manual_release':
      return classState === 'released';
    default:
      return false;
  }
}
