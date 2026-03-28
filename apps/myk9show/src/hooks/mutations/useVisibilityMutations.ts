import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { visibilityKeys } from '@/hooks/queries/useVisibilitySettings';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';
import { PRESET_CONFIGS } from '@myk9/secretary';

// TODO: Remove these casts after regenerating Supabase types with migration 093.
// The generated types still reference the old table schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ShowVisibilityInput {
  showId: string;
  presetName?: VisibilityPreset;
  placementTiming?: VisibilityTiming;
  qualificationTiming?: VisibilityTiming;
  timeTiming?: VisibilityTiming;
  faultsTiming?: VisibilityTiming;
  selfCheckinEnabled?: boolean;
}

interface TrialVisibilityInput {
  trialId: string;
  showId: string;
  presetName?: VisibilityPreset | null;
  selfCheckinEnabled?: boolean | null;
  /** When true, removes the override row entirely (reset to inherited). */
  reset?: boolean;
}

interface ClassVisibilityInput {
  classIds: string[];
  showId: string;
  presetName?: VisibilityPreset | null;
  selfCheckinEnabled?: boolean | null;
  /** When true, removes override rows entirely (reset to inherited). */
  reset?: boolean;
}

/**
 * Build a complete show row from partial input.
 * If only preset is given, derive timing fields from the preset config.
 */
function buildShowRow(
  input: ShowVisibilityInput,
  userId: string | undefined
): Record<string, unknown> {
  const preset = input.presetName ?? 'open';
  const config = PRESET_CONFIGS[preset];

  return {
    show_id: input.showId,
    preset_name: preset,
    placement_timing: input.placementTiming ?? config.placement,
    qualification_timing: input.qualificationTiming ?? config.qualification,
    time_timing: input.timeTiming ?? config.time,
    faults_timing: input.faultsTiming ?? config.faults,
    self_checkin_enabled: input.selfCheckinEnabled ?? true,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ShowVisibilityInput) => {
      const row = buildShowRow(input, user?.id);
      const { error } = await db.from('show_result_visibility_defaults').upsert(row);
      if (error) throw error;
    },
    onSuccess: (_data: unknown, variables: ShowVisibilityInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Show visibility updated');
    },
    onError: () => {
      notifications.error('Failed to update show visibility');
    },
  });
}

export function useUpdateTrialVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: TrialVisibilityInput) => {
      if (input.reset) {
        const { error } = await db
          .from('trial_result_visibility_overrides')
          .delete()
          .eq('trial_id', input.trialId);
        if (error) throw error;
        return;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };

      if (input.presetName !== undefined) {
        updates.preset_name = input.presetName;
        if (input.presetName != null) {
          const config = PRESET_CONFIGS[input.presetName];
          updates.placement_timing = config.placement;
          updates.qualification_timing = config.qualification;
          updates.time_timing = config.time;
          updates.faults_timing = config.faults;
        }
      }
      if (input.selfCheckinEnabled !== undefined) {
        updates.self_checkin_enabled = input.selfCheckinEnabled;
      }

      // Try update first; if no row exists, insert
      const { data, error: updateError } = await db
        .from('trial_result_visibility_overrides')
        .update(updates)
        .eq('trial_id', input.trialId)
        .select('trial_id');

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        const { error: insertError } = await db
          .from('trial_result_visibility_overrides')
          .insert({ trial_id: input.trialId, ...updates });
        if (insertError) throw insertError;
      }
    },
    onSuccess: (_data: unknown, variables: TrialVisibilityInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Trial visibility updated');
    },
    onError: () => {
      notifications.error('Failed to update trial visibility');
    },
  });
}

export function useUpdateClassVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ClassVisibilityInput) => {
      if (input.reset) {
        const { error } = await db
          .from('class_result_visibility_overrides')
          .delete()
          .in('class_id', input.classIds);
        if (error) throw error;
        return;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };

      if (input.presetName !== undefined) {
        updates.preset_name = input.presetName;
        if (input.presetName != null) {
          const config = PRESET_CONFIGS[input.presetName];
          updates.placement_timing = config.placement;
          updates.qualification_timing = config.qualification;
          updates.time_timing = config.time;
          updates.faults_timing = config.faults;
        }
      }
      if (input.selfCheckinEnabled !== undefined) {
        updates.self_checkin_enabled = input.selfCheckinEnabled;
      }

      for (const classId of input.classIds) {
        const { data, error: updateError } = await db
          .from('class_result_visibility_overrides')
          .update(updates)
          .eq('class_id', classId)
          .select('class_id');

        if (updateError) throw updateError;

        if (!data || data.length === 0) {
          const { error: insertError } = await db
            .from('class_result_visibility_overrides')
            .insert({ class_id: classId, ...updates });
          if (insertError) throw insertError;
        }
      }
    },
    onSuccess: (_data: unknown, variables: ClassVisibilityInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Class visibility updated');
    },
    onError: () => {
      notifications.error('Failed to update class visibility');
    },
  });
}
