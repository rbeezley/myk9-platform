/**
 * Show Settings Mutation Hooks
 *
 * React Query mutations for upserting visibility and check-in settings.
 *
 * Note: these tables are added by migration 007 and are not yet in the
 * generated Supabase types, so we use `untypedSupabase` to bypass codegen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { notifications } from '@/lib/notifications';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';
import { settingsQueryKeys, type ShowSettings } from '../queries/useShowSettingsDatabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bypass generated types for tables not yet in codegen
const untypedSupabase = supabase as any;

interface ShowVisibilityUpdate {
  showId: string;
  /** null = custom timings that match no named preset (stored honestly, not coerced) */
  preset: VisibilityPreset | null;
  placementTiming: VisibilityTiming;
  qualificationTiming: VisibilityTiming;
  timeTiming: VisibilityTiming;
  faultsTiming: VisibilityTiming;
}

interface ShowCheckinUpdate {
  showId: string;
  enabled: boolean;
}

interface TrialOverrideUpdate {
  trialId: string;
  showId: string; // for cache invalidation
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

interface ClassOverrideUpdate {
  classId: string;
  trialId: string; // for cache invalidation
  showId: string; // for cache invalidation
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

/**
 * Which facet of an override row a reset should clear.
 * - `'visibility'` nulls only the preset + timing columns (preserves check-in).
 * - `'checkin'` nulls only `self_checkin_enabled` (preserves visibility).
 * - `'all'` nulls everything — the historical behavior, and the default so existing
 *   callers (SettingsOverrideCard, ShowSettingsPage) are unchanged.
 *
 * Independence relies on OMITTING the other facet's columns from the upsert payload,
 * not setting them to null: PostgREST upsert only writes the columns present, so on
 * conflict the omitted columns keep their stored value.
 */
export type ResetFacet = 'visibility' | 'checkin' | 'all';

interface OverrideReset {
  entityId: string;
  showId: string;
  level: 'trial' | 'class';
  facet?: ResetFacet;
}

const VISIBILITY_NULL_COLUMNS = {
  preset: null,
  placement_timing: null,
  qualification_timing: null,
  time_timing: null,
  faults_timing: null,
} as const;

/**
 * Build the upsert payload for a reset. Pure so the column set per facet can be
 * pinned by an assertion-first test — an accidental `self_checkin_enabled: null`
 * in a visibility reset would silently re-couple the two facets.
 */
export function buildResetPayload(params: {
  level: 'trial' | 'class';
  entityId: string;
  facet: ResetFacet;
  userId: string | null;
  timestamp: string;
}): Record<string, unknown> {
  const { level, entityId, facet, userId, timestamp } = params;
  const idColumn = level === 'trial' ? 'trial_id' : 'class_id';
  const payload: Record<string, unknown> = {
    [idColumn]: entityId,
    updated_by: userId,
    updated_at: timestamp,
  };
  if (facet === 'all' || facet === 'visibility') {
    Object.assign(payload, VISIBILITY_NULL_COLUMNS);
  }
  if (facet === 'all' || facet === 'checkin') {
    payload.self_checkin_enabled = null;
  }
  return payload;
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowVisibilityUpdate) => {
      const { error } = await untypedSupabase.from('show_visibility_settings').upsert({
        show_id: update.showId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onMutate: async variables => {
      // Optimistic update: cancel outgoing refetches and snapshot cache
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      const previous = queryClient.getQueryData(settingsQueryKeys.show(variables.showId));
      // Optimistically update the cache with new values
      queryClient.setQueryData(
        settingsQueryKeys.show(variables.showId),
        (old: ShowSettings | undefined) => {
          if (!old) return old;
          return {
            ...old,
            visibility: {
              placement: variables.placementTiming,
              qualification: variables.qualificationTiming,
              time: variables.timeTiming,
              faults: variables.faultsTiming,
              // null (custom) maps to undefined so VisibilitySettings.preset stays
              // optional-not-null and readers render it as "Custom".
              preset: variables.preset ?? undefined,
              inheritedFrom: 'show' as const,
            },
            hasExplicitSettings: true,
          };
        }
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.show(variables.showId), context.previous);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

export function useUpdateShowCheckin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowCheckinUpdate) => {
      // Upsert with standard preset defaults for the required visibility columns.
      // If the row already exists, onConflict on show_id means only the columns
      // listed here are updated — but since upsert sends ALL columns, we must
      // read existing visibility values first to avoid clobbering them.
      const { data: existing } = await untypedSupabase
        .from('show_visibility_settings')
        .select('preset, placement_timing, qualification_timing, time_timing, faults_timing')
        .eq('show_id', update.showId)
        .maybeSingle();

      const { error } = await untypedSupabase.from('show_visibility_settings').upsert({
        show_id: update.showId,
        // Preserve an existing row's preset verbatim — including NULL (custom
        // timings). Only a brand-new row, written alongside the default timings
        // below, gets the 'standard' label.
        preset: existing ? existing.preset : 'standard',
        placement_timing: existing?.placement_timing ?? 'class_complete',
        qualification_timing: existing?.qualification_timing ?? 'immediate',
        time_timing: existing?.time_timing ?? 'class_complete',
        faults_timing: existing?.faults_timing ?? 'class_complete',
        self_checkin_enabled: update.enabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      const previous = queryClient.getQueryData(settingsQueryKeys.show(variables.showId));
      queryClient.setQueryData(
        settingsQueryKeys.show(variables.showId),
        (old: ShowSettings | undefined) => {
          if (!old) return old;
          return { ...old, selfCheckinEnabled: variables.enabled };
        }
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.show(variables.showId), context.previous);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

export function useUpdateTrialOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: TrialOverrideUpdate) => {
      const { error } = await untypedSupabase.from('trial_visibility_overrides').upsert({
        trial_id: update.trialId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        self_checkin_enabled: update.selfCheckinEnabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.trialId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}

export function useUpdateClassOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ClassOverrideUpdate) => {
      const { error } = await untypedSupabase.from('class_visibility_overrides').upsert({
        class_id: update.classId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        self_checkin_enabled: update.selfCheckinEnabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverride(variables.classId),
      });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}

interface BulkClassOverrideUpdate {
  classIds: string[];
  showId: string;
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

export function useBulkUpdateClassOverrides() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: BulkClassOverrideUpdate) => {
      if (update.classIds.length === 0) return;
      const sharedFields: Record<string, unknown> = {
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (update.preset !== undefined) sharedFields.preset = update.preset;
      if (update.placementTiming !== undefined)
        sharedFields.placement_timing = update.placementTiming;
      if (update.qualificationTiming !== undefined)
        sharedFields.qualification_timing = update.qualificationTiming;
      if (update.timeTiming !== undefined) sharedFields.time_timing = update.timeTiming;
      if (update.faultsTiming !== undefined) sharedFields.faults_timing = update.faultsTiming;
      if (update.selfCheckinEnabled !== undefined)
        sharedFields.self_checkin_enabled = update.selfCheckinEnabled;

      const rows = update.classIds.map(classId => ({
        class_id: classId,
        ...sharedFields,
      }));
      const { error } = await untypedSupabase.from('class_visibility_overrides').upsert(rows);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
    },
    onError: () => {
      notifications.error('Failed to update class overrides');
    },
  });
}

/**
 * Reset an override row by setting its nullable columns to NULL (not DELETE).
 * Spec: "No DELETE — rows are upserted, not removed (reset = set columns to NULL)."
 * Works for both trial and class overrides. `facet` (default `'all'`) scopes the
 * reset so a visibility reset preserves an existing check-in override and vice versa.
 */
export function useResetOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (reset: OverrideReset) => {
      const table =
        reset.level === 'trial' ? 'trial_visibility_overrides' : 'class_visibility_overrides';
      const payload = buildResetPayload({
        level: reset.level,
        entityId: reset.entityId,
        facet: reset.facet ?? 'all',
        userId: user?.id ?? null,
        timestamp: new Date().toISOString(),
      });
      const { error } = await untypedSupabase.from(table).upsert(payload);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverride(variables.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}
