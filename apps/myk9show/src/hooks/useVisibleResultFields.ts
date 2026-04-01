import { useMemo } from 'react';
import { resolveVisibilityCascade, getVisibleResultFields } from '@myk9/secretary';
import type {
  VisibilitySettings,
  VisibilityTiming,
  VisibilityPreset,
  VisibleResultFields,
  ClassState,
  VisibilityOverride,
  VisibilityUserRole,
} from '@myk9/secretary';
import {
  useVisibilitySettings,
  getDefaultShowSettings,
} from '@/hooks/queries/useVisibilitySettings';
import type { OverrideRow, ShowVisibilityRow } from '@/hooks/queries/useVisibilitySettings';
import { useAuthContext } from '@/hooks/useAuthContext';

function rowToSettings(
  row: ShowVisibilityRow
): VisibilitySettings & { selfCheckinEnabled: boolean } {
  const settings: VisibilitySettings & { selfCheckinEnabled: boolean } = {
    placement: row.placement_timing as VisibilityTiming,
    qualification: row.qualification_timing as VisibilityTiming,
    time: row.time_timing as VisibilityTiming,
    faults: row.faults_timing as VisibilityTiming,
    inheritedFrom: 'show',
    selfCheckinEnabled: row.self_checkin_enabled,
  };
  if (row.preset) {
    settings.preset = row.preset as VisibilityPreset;
  }
  return settings;
}

function rowToOverride(
  row: OverrideRow
): VisibilityOverride & { selfCheckinEnabled?: boolean | null } {
  const override: VisibilityOverride & { selfCheckinEnabled?: boolean | null } = {};
  if (row.preset != null) override.preset = row.preset as VisibilityPreset;
  if (row.placement_timing != null) override.placement = row.placement_timing as VisibilityTiming;
  if (row.qualification_timing != null)
    override.qualification = row.qualification_timing as VisibilityTiming;
  if (row.time_timing != null) override.time = row.time_timing as VisibilityTiming;
  if (row.faults_timing != null) override.faults = row.faults_timing as VisibilityTiming;
  if (row.self_checkin_enabled != null) override.selfCheckinEnabled = row.self_checkin_enabled;
  return override;
}

function mapUserRole(auth: {
  isAdmin: boolean;
  isSecretary: boolean;
  isJudge: boolean;
}): VisibilityUserRole {
  if (auth.isAdmin) return 'admin';
  if (auth.isSecretary) return 'secretary';
  if (auth.isJudge) return 'judge';
  return 'exhibitor';
}

/**
 * Derive ClassState from class data.
 * 'released' = results_released_at is set (for manual_release timing).
 * 'completed' = class status is completed but not manually released.
 * 'in_progress' = everything else.
 */
export function deriveClassState(
  classStatus: string | undefined,
  resultsReleasedAt: string | null | undefined
): ClassState {
  if (resultsReleasedAt) return 'released';
  if (classStatus === 'completed' || classStatus === 'Completed') return 'completed';
  return 'in_progress';
}

/** Default: all fields visible, check-in enabled. Used during loading. */
const ALL_VISIBLE: VisibleResultFields & { selfCheckinEnabled: boolean } = {
  showPlacement: true,
  showQualification: true,
  showTime: true,
  showFaults: true,
  selfCheckinEnabled: true,
};

/**
 * Resolve effective visibility for a specific class.
 * Returns field visibility booleans + self check-in flag.
 */
export function useVisibleResultFields(
  showId: string | undefined,
  trialId: string | undefined,
  classId: string | undefined,
  classState: ClassState
): VisibleResultFields & { selfCheckinEnabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useVisibilitySettings(showId);
  const auth = useAuthContext();
  const userRole = mapUserRole(auth);

  return useMemo(() => {
    if (!data || isLoading) return { ...ALL_VISIBLE, isLoading };

    const showSettings = data.showDefaults
      ? rowToSettings(data.showDefaults)
      : getDefaultShowSettings();

    const trialRow = trialId ? data.trialOverrides.find(r => r.trial_id === trialId) : undefined;
    const classRow = classId ? data.classOverrides.find(r => r.class_id === classId) : undefined;

    const trialOverride = trialRow ? rowToOverride(trialRow) : undefined;
    const classOverride = classRow ? rowToOverride(classRow) : undefined;

    const effective = resolveVisibilityCascade(showSettings, trialOverride, classOverride);

    const selfCheckinEnabled =
      classOverride?.selfCheckinEnabled ??
      trialOverride?.selfCheckinEnabled ??
      showSettings.selfCheckinEnabled;

    const fields = getVisibleResultFields(effective, classState, userRole);

    return { ...fields, selfCheckinEnabled, isLoading };
  }, [data, isLoading, trialId, classId, classState, userRole]);
}
