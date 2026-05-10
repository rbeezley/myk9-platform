import type { VisibilityPreset, VisibilitySettings, VisibilityTiming } from '@myk9/secretary';
import { PRESET_CONFIGS } from '@myk9/secretary';
import { supabase } from '../supabaseClient';
import type { Database } from '@/types/supabase';

type Tables = Database['public']['Tables'];
type ShowVisibilityInsert = Tables['show_visibility_settings']['Insert'];
type TrialVisibilityUpdate = Tables['trial_visibility_overrides']['Update'];
type ClassVisibilityUpdate = Tables['class_visibility_overrides']['Update'];

export type ShowVisibilityRow = Tables['show_visibility_settings']['Row'];
export type TrialVisibilityRow = Tables['trial_visibility_overrides']['Row'];
export type ClassVisibilityRow = Tables['class_visibility_overrides']['Row'];

export type OverrideRow = TrialVisibilityRow | ClassVisibilityRow;

export interface VisibilityData {
  showDefaults: ShowVisibilityRow | null;
  trialOverrides: TrialVisibilityRow[];
  classOverrides: ClassVisibilityRow[];
}

export interface ShowVisibilityInput {
  showId: string;
  presetName?: VisibilityPreset;
  placementTiming?: VisibilityTiming;
  qualificationTiming?: VisibilityTiming;
  timeTiming?: VisibilityTiming;
  faultsTiming?: VisibilityTiming;
  selfCheckinEnabled?: boolean;
}

export interface TrialVisibilityInput {
  trialId: string;
  presetName?: VisibilityPreset | null;
  selfCheckinEnabled?: boolean | null;
  reset?: boolean;
}

export interface ClassVisibilityInput {
  classIds: string[];
  presetName?: VisibilityPreset | null;
  selfCheckinEnabled?: boolean | null;
  reset?: boolean;
}

export const visibilityKeys = {
  all: ['visibility'] as const,
  show: (showId: string) => ['visibility', 'show', showId] as const,
};

export async function getVisibilitySettings(showId: string): Promise<VisibilityData> {
  const [showResult, trialsResult] = await Promise.all([
    supabase.from('show_visibility_settings').select('*').eq('show_id', showId).maybeSingle(),
    supabase.from('trials').select('id').eq('show_id', showId),
  ]);

  if (showResult.error) throw showResult.error;
  if (trialsResult.error) throw trialsResult.error;

  const trialIds = (trialsResult.data ?? []).map(t => t.id);
  if (trialIds.length === 0) {
    return {
      showDefaults: showResult.data,
      trialOverrides: [],
      classOverrides: [],
    };
  }

  const [trialResult, classResult] = await Promise.all([
    supabase.from('trial_visibility_overrides').select('*').in('trial_id', trialIds),
    supabase
      .from('class_visibility_overrides')
      .select('*, classes!inner(trial_id)')
      .in('classes.trial_id', trialIds),
  ]);

  if (trialResult.error) throw trialResult.error;
  if (classResult.error) throw classResult.error;

  return {
    showDefaults: showResult.data,
    trialOverrides: trialResult.data ?? [],
    classOverrides: (classResult.data ?? []) as unknown as ClassVisibilityRow[],
  };
}

export function getDefaultShowSettings(): VisibilitySettings & { selfCheckinEnabled: boolean } {
  return {
    ...PRESET_CONFIGS.open,
    preset: 'open',
    inheritedFrom: 'show',
    selfCheckinEnabled: true,
  };
}

function buildShowRow(input: ShowVisibilityInput, userId: string | undefined): ShowVisibilityInsert {
  const preset = input.presetName ?? 'open';
  const config = PRESET_CONFIGS[preset];

  return {
    show_id: input.showId,
    preset,
    placement_timing: input.placementTiming ?? config.placement,
    qualification_timing: input.qualificationTiming ?? config.qualification,
    time_timing: input.timeTiming ?? config.time,
    faults_timing: input.faultsTiming ?? config.faults,
    self_checkin_enabled: input.selfCheckinEnabled ?? true,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };
}

function buildOverrideUpdate(
  input: Pick<TrialVisibilityInput | ClassVisibilityInput, 'presetName' | 'selfCheckinEnabled'>,
  userId: string | undefined
): Omit<TrialVisibilityUpdate & ClassVisibilityUpdate, 'trial_id' | 'class_id'> {
  const updates: Omit<TrialVisibilityUpdate & ClassVisibilityUpdate, 'trial_id' | 'class_id'> = {
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };

  if (input.presetName !== undefined) {
    updates.preset = input.presetName;
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

  return updates;
}

export async function updateShowVisibility(
  input: ShowVisibilityInput,
  userId: string | undefined
): Promise<void> {
  const { error } = await supabase.from('show_visibility_settings').upsert(buildShowRow(input, userId));
  if (error) throw error;
}

export async function updateTrialVisibility(
  input: TrialVisibilityInput,
  userId: string | undefined
): Promise<void> {
  if (input.reset) {
    const { error } = await supabase
      .from('trial_visibility_overrides')
      .delete()
      .eq('trial_id', input.trialId);
    if (error) throw error;
    return;
  }

  const updates = buildOverrideUpdate(input, userId);
  const { data, error: updateError } = await supabase
    .from('trial_visibility_overrides')
    .update(updates)
    .eq('trial_id', input.trialId)
    .select('trial_id');

  if (updateError) throw updateError;

  if (!data || data.length === 0) {
    const { error } = await supabase
      .from('trial_visibility_overrides')
      .insert({ trial_id: input.trialId, ...updates });
    if (error) throw error;
  }
}

export async function updateClassVisibility(
  input: ClassVisibilityInput,
  userId: string | undefined
): Promise<void> {
  if (input.reset) {
    const { error } = await supabase
      .from('class_visibility_overrides')
      .delete()
      .in('class_id', input.classIds);
    if (error) throw error;
    return;
  }

  const updates = buildOverrideUpdate(input, userId);

  for (const classId of input.classIds) {
    const { data, error: updateError } = await supabase
      .from('class_visibility_overrides')
      .update(updates)
      .eq('class_id', classId)
      .select('class_id');

    if (updateError) throw updateError;

    if (!data || data.length === 0) {
      const { error } = await supabase
        .from('class_visibility_overrides')
        .insert({ class_id: classId, ...updates });
      if (error) throw error;
    }
  }
}
