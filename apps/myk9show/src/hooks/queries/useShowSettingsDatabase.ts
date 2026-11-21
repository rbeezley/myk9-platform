/**
 * Show Settings Query Hooks
 *
 * React Query hooks for fetching visibility and check-in settings
 * from show_visibility_settings, trial_visibility_overrides,
 * and class_visibility_overrides tables.
 */
import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { markUnreachableIfTransportFailure } from '@/lib/serverReachability';
import type { Tables } from '@/types/supabase';
import {
  resolvePreset,
  type VisibilitySettings,
  type VisibilityOverride,
  type VisibilityTiming,
  type VisibilityPreset,
} from '@myk9/secretary';

// Query key factory
export const settingsQueryKeys = {
  all: ['showSettings'] as const,
  show: (showId: string) => [...settingsQueryKeys.all, 'show', showId] as const,
  trials: (showId: string) => [...settingsQueryKeys.all, 'trials', showId] as const,
  trialOverride: (trialId: string) => [...settingsQueryKeys.all, 'trial', trialId] as const,
  classOverride: (classId: string) => [...settingsQueryKeys.all, 'class', classId] as const,
  classOverrides: (showId: string) => [...settingsQueryKeys.all, 'classOverrides', showId] as const,
};

type ShowSettingsRow = Tables<'show_visibility_settings'>;
type OverrideRow = Tables<'trial_visibility_overrides'> | Tables<'class_visibility_overrides'>;

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
  /**
   * MYK9-969: the club keeps this show's results private — only each entry's
   * own people and show staff see them. Never makes a private result public.
   * Optional so a settings value built elsewhere reads as "not private".
   */
  resultsPrivate?: boolean | undefined;
  hasExplicitSettings: boolean;
}

/**
 * Sensible default settings for when no explicit row exists OR a read fails.
 * `hasExplicitSettings: false` signals callers that these are fallbacks, not
 * saved values — the page uses this both for the no-row case and as a defensive
 * fallback so an errored query never leaves the panel frozen on a skeleton.
 */
export function getDefaultShowSettings(): ShowSettings {
  return {
    visibility: resolvePreset('standard', 'show'),
    selfCheckinEnabled: true,
    resultsPrivate: false,
    hasExplicitSettings: false,
  };
}

/**
 * Bound retries on visibility reads. The global query retry only short-circuits
 * errors carrying a numeric `.status` 4xx, but PostgREST/Postgres errors (e.g. a
 * 400 on a malformed UUID, or an RLS `42501`) carry a string `code` instead — so
 * the global predicate retries them twice with backoff, prolonging the loading
 * skeleton on a hard, deterministic error.
 *
 * These errors won't change on retry, so settle immediately and surface them;
 * everything else (a transient network blip with no `code`) gets one bounded
 * retry. Using a predicate rather than a constant also means a caller that opts
 * out via `retry: false` still gets no retry for `code`-bearing errors.
 */
function visibilityQueryRetry(failureCount: number, error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) return false;
  return failureCount < 1;
}

/** Throw a failed read, first telling the reachability flag if it never reached the server (MYK9-866). */
function throwIfReadFailed(result: { error?: unknown; status?: number | null }): void {
  if (!result.error) return;
  markUnreachableIfTransportFailure(result);
  throw result.error;
}

async function fetchShowSettings(showId: string): Promise<ShowSettings> {
  const result = await supabase
    .from('show_visibility_settings')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle();
  throwIfReadFailed(result);
  const { data } = result;

  if (!data) {
    return getDefaultShowSettings();
  }

  return {
    visibility: rowToVisibilitySettings(data),
    selfCheckinEnabled: data.self_checkin_enabled,
    resultsPrivate: data.results_private === true,
    hasExplicitSettings: true,
  };
}

export function useShowSettings(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.show(showId!),
    queryFn: () => fetchShowSettings(showId!),
    enabled: !!showId,
    retry: visibilityQueryRetry,
    ...cacheStrategies.moderate,
  });
}

/**
 * Show ids (of those given) whose settings loaded and are not club-private. Same
 * query key and fetch as useShowSettings, so a show the page already reads costs
 * nothing extra. A show whose setting is unknown or failed is left out (MYK9-2174).
 */
export function useResultsPromptableShowIds(showIds: readonly string[]): ReadonlySet<string> {
  const results = useQueries({
    queries: showIds.map(showId => ({
      queryKey: settingsQueryKeys.show(showId),
      queryFn: () => fetchShowSettings(showId),
      retry: visibilityQueryRetry,
      ...cacheStrategies.moderate,
    })),
  });
  const promptable = showIds.filter((_, i) => results[i]?.data?.resultsPrivate === false);
  const key = promptable.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the set's content
  return useMemo(() => new Set(promptable), [key]);
}

/** All trial overrides for a show (for the settings page list) */
export interface TrialOverrideEntry {
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}

async function fetchTrialOverrides(showId: string): Promise<TrialOverrideEntry[]> {
  const trialsResult = await supabase.from('trials').select('id').eq('show_id', showId);
  throwIfReadFailed(trialsResult);
  const { data: trials } = trialsResult;
  if (!trials?.length) return [];

  const trialIds = trials.map(t => t.id);
  const overridesResult = await supabase
    .from('trial_visibility_overrides')
    .select('*')
    .in('trial_id', trialIds);
  throwIfReadFailed(overridesResult);
  const { data: overrides } = overridesResult;
  if (!overrides) return [];

  return overrides.map(row => ({
    trialId: row.trial_id,
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useTrialOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.trials(showId!),
    queryFn: () => fetchTrialOverrides(showId!),
    enabled: !!showId,
    retry: visibilityQueryRetry,
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
  const classesResult = await supabase
    .from('classes')
    .select('id, trial_id, trials!inner(show_id)')
    .eq('trials.show_id', showId);
  throwIfReadFailed(classesResult);
  const { data: classes } = classesResult;
  if (!classes?.length) return [];

  const classIds = classes.map(c => c.id);
  const overridesResult = await supabase
    .from('class_visibility_overrides')
    .select('*')
    .in('class_id', classIds);
  throwIfReadFailed(overridesResult);
  const { data: overrides } = overridesResult;
  if (!overrides) return [];

  const classTrialMap = new Map(classes.map(c => [c.id, c.trial_id]));

  return overrides.map(row => ({
    classId: row.class_id,
    trialId: classTrialMap.get(row.class_id) ?? '',
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useClassOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.classOverrides(showId!),
    queryFn: () => fetchClassOverrides(showId!),
    enabled: !!showId,
    retry: visibilityQueryRetry,
    ...cacheStrategies.moderate,
  });
}
