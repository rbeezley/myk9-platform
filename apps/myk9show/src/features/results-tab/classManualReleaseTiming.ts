import { resolveVisibilityCascade } from '@myk9/secretary';
import {
  useClassOverrides,
  useShowSettings,
  useTrialOverrides,
  type ClassOverrideEntry,
  type ShowSettings,
  type TrialOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';

const TIMING_FIELDS = ['placement', 'qualification', 'time', 'faults'] as const;

/**
 * Does this class use `manual_release` timing on any field once the show, trial and class levels
 * are resolved by the shared visibility cascade (presets included)?
 *
 * Only those fields respond to clearing `results_released_at`: 'immediate' fields are always shown
 * and 'class_complete' fields stay visible once the class is complete, so Hide results has no
 * visible effect on them (see `shouldShowField` in @myk9/secretary's visibility cascade).
 */
export function classHasManualReleaseTiming(
  settings: ShowSettings | undefined,
  trialOverrides: readonly TrialOverrideEntry[],
  classOverrides: readonly ClassOverrideEntry[],
  classId: string,
  trialId: string
): boolean {
  if (!settings) return false;
  const classOverride = classOverrides.find(o => o.classId === classId)?.override;
  const trialOverride = trialOverrides.find(o => o.trialId === trialId)?.override;
  const resolved = resolveVisibilityCascade(settings.visibility, trialOverride, classOverride);
  return TIMING_FIELDS.some(field => resolved[field] === 'manual_release');
}

/**
 * Whether Hide results can change anything for this class. False while any of the three reads has
 * no data (loading, or failed with nothing cached): a control whose effect is unknown is not shown.
 */
export function useClassManualReleaseTiming(
  showId: string,
  classId: string,
  trialId: string
): boolean {
  const settings = useShowSettings(showId).data;
  const trialOverrides = useTrialOverrides(showId).data;
  const classOverrides = useClassOverrides(showId).data;
  if (!settings || !trialOverrides || !classOverrides) return false;
  return classHasManualReleaseTiming(settings, trialOverrides, classOverrides, classId, trialId);
}
