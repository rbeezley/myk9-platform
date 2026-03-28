import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { visibilityKeys } from '@/hooks/queries/useVisibilitySettings';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';

interface ShowVisibilityInput {
  showId: string;
  presetName: VisibilityPreset;
  placementTiming: VisibilityTiming;
  qualificationTiming: VisibilityTiming;
  timeTiming: VisibilityTiming;
  faultsTiming: VisibilityTiming;
  selfCheckinEnabled: boolean;
}

interface TrialVisibilityInput {
  trialId: string;
  showId: string;
  presetName?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

interface ClassVisibilityInput {
  classIds: string[];
  showId: string;
  presetName?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ShowVisibilityInput) => {
      const { error } = await supabase.from('show_result_visibility_defaults').upsert({
        show_id: input.showId,
        preset_name: input.presetName,
        placement_timing: input.placementTiming,
        qualification_timing: input.qualificationTiming,
        time_timing: input.timeTiming,
        faults_timing: input.faultsTiming,
        self_checkin_enabled: input.selfCheckinEnabled,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
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
      const allNull =
        input.presetName == null &&
        input.placementTiming == null &&
        input.qualificationTiming == null &&
        input.timeTiming == null &&
        input.faultsTiming == null &&
        input.selfCheckinEnabled == null;

      if (allNull) {
        const { error } = await supabase
          .from('trial_result_visibility_overrides')
          .delete()
          .eq('trial_id', input.trialId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trial_result_visibility_overrides').upsert({
          trial_id: input.trialId,
          preset_name: input.presetName ?? null,
          placement_timing: input.placementTiming ?? null,
          qualification_timing: input.qualificationTiming ?? null,
          time_timing: input.timeTiming ?? null,
          faults_timing: input.faultsTiming ?? null,
          self_checkin_enabled: input.selfCheckinEnabled ?? null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
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
      const allNull =
        input.presetName == null &&
        input.placementTiming == null &&
        input.qualificationTiming == null &&
        input.timeTiming == null &&
        input.faultsTiming == null &&
        input.selfCheckinEnabled == null;

      if (allNull) {
        const { error } = await supabase
          .from('class_result_visibility_overrides')
          .delete()
          .in('class_id', input.classIds);
        if (error) throw error;
      } else {
        const rows = input.classIds.map(classId => ({
          class_id: classId,
          preset_name: input.presetName ?? null,
          placement_timing: input.placementTiming ?? null,
          qualification_timing: input.qualificationTiming ?? null,
          time_timing: input.timeTiming ?? null,
          faults_timing: input.faultsTiming ?? null,
          self_checkin_enabled: input.selfCheckinEnabled ?? null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        }));
        const { error } = await supabase.from('class_result_visibility_overrides').upsert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Class visibility updated');
    },
    onError: () => {
      notifications.error('Failed to update class visibility');
    },
  });
}
