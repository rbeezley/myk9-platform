/**
 * Show Settings Query Hooks
 *
 * React Query hooks for fetching visibility and check-in settings
 * from show_visibility_settings, trial_visibility_overrides,
 * and class_visibility_overrides tables.
 *
 * Note: these tables are added by migration 007 and are not yet in the
 * generated Supabase types, so we use `untypedSupabase` to bypass codegen.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import {
  resolveVisibilityCascade,
  resolveCheckinCascade,
  resolvePreset,
  type VisibilitySettings,
  type VisibilityOverride,
  type VisibilityTiming,
  type VisibilityPreset,
} from '@myk9/secretary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bypass generated types for tables not yet in codegen
const untypedSupabase = supabase as any;

// Query key factory
export const settingsQueryKeys = {
  all: ['showSettings'] as const,
  show: (showId: string) => [...settingsQueryKeys.all, 'show', showId] as const,
  trials: (showId: string) => [...settingsQueryKeys.all, 'trials', showId] as const,
  trialOverride: (trialId: string) => [...settingsQueryKeys.all, 'trial', trialId] as const,
  classOverride: (classId: string) => [...settingsQueryKeys.all, 'class', classId] as const,
  classOverrides: (showId: string) => [...settingsQueryKeys.all, 'classOverrides', showId] as const,
};

/** DB row shape for show_visibility_settings */
interface ShowSettingsRow {
  show_id: string;
  preset: string;
  placement_timing: string;
  qualification_timing: string;
  time_timing: string;
  faults_timing: string;
  self_checkin_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

/** DB row shape for trial/class overrides */
interface OverrideRow {
  trial_id?: string;
  class_id?: string;
  preset: string | null;
  placement_timing: string | null;
  qualification_timing: string | null;
  time_timing: string | null;
  faults_timing: string | null;
  self_checkin_enabled: boolean | null;
  updated_by: string | null;
  updated_at: string;
}

/** Map DB column names (_timing suffix) to shared type field names (short) */
function rowToVisibilitySettings(row: ShowSettingsRow): VisibilitySettings {
  const settings: VisibilitySettings = {
    placement: row.placement_timing as VisibilityTiming,
    qualification: row.qualification_timing as VisibilityTiming,
    time: row.time_timing as VisibilityTiming,
    faults: row.faults_timing as VisibilityTiming,
    inheritedFrom: 'show',
  };
  if (row.preset) {
    settings.preset = row.preset as VisibilityPreset;
  }
  return settings;
}

/** Map DB override row to VisibilityOverride (nullable fields) */
function rowToOverride(row: OverrideRow): VisibilityOverride {
  const override: VisibilityOverride = {};
  if (row.preset !== undefined) override.preset = row.preset as VisibilityPreset | null;
  if (row.placement_timing !== undefined)
    override.placement = row.placement_timing as VisibilityTiming | null;
  if (row.qualification_timing !== undefined)
    override.qualification = row.qualification_timing as VisibilityTiming | null;
  if (row.time_timing !== undefined) override.time = row.time_timing as VisibilityTiming | null;
  if (row.faults_timing !== undefined)
    override.faults = row.faults_timing as VisibilityTiming | null;
  return override;
}

/** Show-level settings (or defaults if no row exists) */
export interface ShowSettings {
  visibility: VisibilitySettings;
  selfCheckinEnabled: boolean;
  hasExplicitSettings: boolean;
}

async function fetchShowSettings(showId: string): Promise<ShowSettings> {
  const { data, error } = await untypedSupabase
    .from('show_visibility_settings')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      visibility: resolvePreset('standard', 'show'),
      selfCheckinEnabled: true,
      hasExplicitSettings: false,
    };
  }

  const row = data as ShowSettingsRow;
  return {
    visibility: rowToVisibilitySettings(row),
    selfCheckinEnabled: row.self_checkin_enabled,
    hasExplicitSettings: true,
  };
}

export function useShowSettings(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.show(showId!),
    queryFn: () => fetchShowSettings(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/** All trial overrides for a show (for the settings page list) */
export interface TrialOverrideEntry {
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}

async function fetchTrialOverrides(showId: string): Promise<TrialOverrideEntry[]> {
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id')
    .eq('show_id', showId);

  if (trialsError) throw trialsError;
  if (!trials?.length) return [];

  const trialIds = trials.map(t => t.id);
  const { data: overrides, error } = await untypedSupabase
    .from('trial_visibility_overrides')
    .select('*')
    .in('trial_id', trialIds);

  if (error) throw error;
  if (!overrides) return [];

  return (overrides as OverrideRow[]).map(row => ({
    trialId: row.trial_id!,
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useTrialOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.trials(showId!),
    queryFn: () => fetchTrialOverrides(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/** All class overrides for a show (for the settings page list) */
export interface ClassOverrideEntry {
  classId: string;
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}

async function fetchClassOverrides(showId: string): Promise<ClassOverrideEntry[]> {
  // Get all classes for this show's trials in one query
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(show_id)')
    .eq('trials.show_id', showId);

  if (classesError) throw classesError;
  if (!classes?.length) return [];

  const classIds = classes.map(c => c.id);
  const { data: overrides, error } = await untypedSupabase
    .from('class_visibility_overrides')
    .select('*')
    .in('class_id', classIds);

  if (error) throw error;
  if (!overrides) return [];

  const classTrialMap = new Map(classes.map(c => [c.id, c.trial_id]));

  return (overrides as OverrideRow[]).map(row => ({
    classId: row.class_id!,
    trialId: classTrialMap.get(row.class_id!) ?? '',
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useClassOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.classOverrides(showId!),
    queryFn: () => fetchClassOverrides(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/**
 * Resolve effective visibility for a class through the full cascade.
 * Fetches show settings + trial override + class override, then resolves.
 */
async function fetchClassEffectiveSettings(
  classId: string,
  trialId: string,
  showId: string
): Promise<{ visibility: VisibilitySettings; selfCheckinEnabled: boolean }> {
  // Fetch all three levels in parallel
  const [showResult, trialResult, classResult] = await Promise.all([
    untypedSupabase
      .from('show_visibility_settings')
      .select('*')
      .eq('show_id', showId)
      .maybeSingle(),
    untypedSupabase
      .from('trial_visibility_overrides')
      .select('*')
      .eq('trial_id', trialId)
      .maybeSingle(),
    untypedSupabase
      .from('class_visibility_overrides')
      .select('*')
      .eq('class_id', classId)
      .maybeSingle(),
  ]);

  if (showResult.error) throw showResult.error;
  if (trialResult.error) throw trialResult.error;
  if (classResult.error) throw classResult.error;

  const showSettings = showResult.data
    ? rowToVisibilitySettings(showResult.data as ShowSettingsRow)
    : resolvePreset('standard', 'show');
  const showCheckin = (showResult.data as ShowSettingsRow | null)?.self_checkin_enabled ?? true;

  const trialOverride = trialResult.data
    ? rowToOverride(trialResult.data as OverrideRow)
    : undefined;
  const trialCheckin = (trialResult.data as OverrideRow | null)?.self_checkin_enabled ?? null;

  const classOverride = classResult.data
    ? rowToOverride(classResult.data as OverrideRow)
    : undefined;
  const classCheckin = (classResult.data as OverrideRow | null)?.self_checkin_enabled ?? null;

  return {
    visibility: resolveVisibilityCascade(showSettings, trialOverride, classOverride),
    selfCheckinEnabled: resolveCheckinCascade(showCheckin, trialCheckin, classCheckin),
  };
}

export function useClassEffectiveSettings(
  classId: string | null,
  trialId: string | null,
  showId: string | null
) {
  return useQuery({
    queryKey: [...settingsQueryKeys.classOverride(classId!), trialId!, showId!],
    queryFn: () => fetchClassEffectiveSettings(classId!, trialId!, showId!),
    enabled: !!classId && !!trialId && !!showId,
    ...cacheStrategies.moderate,
  });
}
