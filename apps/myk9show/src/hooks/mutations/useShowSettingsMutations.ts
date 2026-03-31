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
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';
import { settingsQueryKeys, type ShowSettings } from '../queries/useShowSettingsDatabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bypass generated types for tables not yet in codegen
const untypedSupabase = supabase as any;

interface ShowVisibilityUpdate {
  showId: string;
  preset: VisibilityPreset;
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

interface OverrideReset {
  entityId: string;
  showId: string;
  level: 'trial' | 'class';
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
              preset: variables.preset,
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
        preset: existing?.preset ?? 'standard',
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

// [ADDED] Batch upsert for bulk class operations — single DB call instead of N
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
      const rows = update.classIds.map(classId => ({
        class_id: classId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        self_checkin_enabled: update.selfCheckinEnabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
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
  });
}

/**
 * Reset an override row by setting all nullable columns to NULL (not DELETE).
 * Spec: "No DELETE — rows are upserted, not removed (reset = set columns to NULL)."
 * Works for both trial and class overrides.
 */
export function useResetOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (reset: OverrideReset) => {
      const table =
        reset.level === 'trial' ? 'trial_visibility_overrides' : 'class_visibility_overrides';
      const idColumn = reset.level === 'trial' ? 'trial_id' : 'class_id';
      const { error } = await untypedSupabase.from(table).upsert({
        [idColumn]: reset.entityId,
        preset: null,
        placement_timing: null,
        qualification_timing: null,
        time_timing: null,
        faults_timing: null,
        self_checkin_enabled: null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
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
