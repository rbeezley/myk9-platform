import type { VisibilityPreset, VisibilitySettings, PresetInfo } from './visibility-types';

/** Field timings for each preset */
export const PRESET_CONFIGS: Record<
  VisibilityPreset,
  Omit<VisibilitySettings, 'inheritedFrom' | 'preset'>
> = {
  open: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'immediate',
    faults: 'immediate',
  },
  standard: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
  },
  review: {
    placement: 'manual_release',
    qualification: 'manual_release',
    time: 'manual_release',
    faults: 'manual_release',
  },
};

/** UI metadata for each preset (no icons — apps add their own) */
export const PRESET_INFO: Record<VisibilityPreset, PresetInfo> = {
  open: {
    preset: 'open',
    title: 'Immediately',
    description: 'Show results immediately as dogs run',
    details: 'Q/NQ, Time, Faults visible right away. Placement when class completes.',
  },
  standard: {
    preset: 'standard',
    title: 'After Class',
    description: 'Show Q/NQ immediately, rest when class completes',
    details: 'Q/NQ visible as scored. Time, Faults, Placement when class finishes.',
  },
  review: {
    preset: 'review',
    title: 'After Review',
    description: 'Judge must approve before results are visible',
    details: 'All results hidden until you click "Release Results" button.',
  },
};

/**
 * Convert a preset name to a complete VisibilitySettings object.
 *
 * @param preset - Preset name
 * @param source - Where the preset is applied (show/trial/class)
 */
export function resolvePreset(
  preset: VisibilityPreset,
  source: 'show' | 'trial' | 'class'
): VisibilitySettings {
  return {
    ...PRESET_CONFIGS[preset],
    inheritedFrom: source,
    preset,
  };
}
