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
 * What Hide results can do for this class. `manual` and `not-manual` need all three reads;
 * `unknown` is a read still loading, `unreadable` a read that failed with nothing cached. Neither
 * is ever treated as manual: a control whose effect is unknown does not act.
 */
export type ClassReleaseTiming = 'manual' | 'not-manual' | 'unknown' | 'unreadable';

export function useClassManualReleaseTiming(
  showId: string,
  classId: string,
  trialId: string
): ClassReleaseTiming {
  const show = useShowSettings(showId);
  const trials = useTrialOverrides(showId);
  const classes = useClassOverrides(showId);
  const settings = show.data;
  const trialOverrides = trials.data;
  const classOverrides = classes.data;
  if (!settings || !trialOverrides || !classOverrides) {
    const failedWithNoData =
      (!settings && show.isError) ||
      (!trialOverrides && trials.isError) ||
      (!classOverrides && classes.isError);
    return failedWithNoData ? 'unreadable' : 'unknown';
  }
  return classHasManualReleaseTiming(settings, trialOverrides, classOverrides, classId, trialId)
    ? 'manual'
    : 'not-manual';
}
