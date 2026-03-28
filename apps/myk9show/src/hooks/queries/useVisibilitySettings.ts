import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import type { VisibilitySettings } from '@myk9/secretary';
import { PRESET_CONFIGS } from '@myk9/secretary';

export interface ShowVisibilityRow {
  show_id: string;
  preset_name: string;
  placement_timing: string;
  qualification_timing: string;
  time_timing: string;
  faults_timing: string;
  self_checkin_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface OverrideRow {
  trial_id?: string;
  class_id?: string;
  preset_name: string | null;
  placement_timing: string | null;
  qualification_timing: string | null;
  time_timing: string | null;
  faults_timing: string | null;
  self_checkin_enabled: boolean | null;
}

export interface VisibilityData {
  showDefaults: ShowVisibilityRow | null;
  trialOverrides: OverrideRow[];
  classOverrides: OverrideRow[];
}

export const visibilityKeys = {
  all: ['visibility'] as const,
  show: (showId: string) => ['visibility', 'show', showId] as const,
};

async function fetchVisibilitySettings(showId: string): Promise<VisibilityData> {
  const [showResult, trialResult, classResult] = await Promise.all([
    supabase
      .from('show_result_visibility_defaults')
      .select('*')
      .eq('show_id', showId)
      .maybeSingle(),
    supabase
      .from('trial_result_visibility_overrides')
      .select('*, trials!inner(show_id)')
      .eq('trials.show_id', showId),
    supabase
      .from('class_result_visibility_overrides')
      .select('*, classes!inner(trial_id, trials!inner(show_id))')
      .eq('classes.trials.show_id', showId),
  ]);

  if (showResult.error) throw showResult.error;
  if (trialResult.error) throw trialResult.error;
  if (classResult.error) throw classResult.error;

  return {
    showDefaults: showResult.data as ShowVisibilityRow | null,
    trialOverrides: (trialResult.data ?? []) as unknown as OverrideRow[],
    classOverrides: (classResult.data ?? []) as unknown as OverrideRow[],
  };
}

/** Default show settings when no row exists (preset: open) */
export function getDefaultShowSettings(): VisibilitySettings & { selfCheckinEnabled: boolean } {
  return {
    ...PRESET_CONFIGS.open,
    preset: 'open',
    inheritedFrom: 'show',
    selfCheckinEnabled: true,
  };
}

export function useVisibilitySettings(showId: string | undefined) {
  return useQuery({
    queryKey: visibilityKeys.show(showId ?? ''),
    queryFn: () => fetchVisibilitySettings(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
