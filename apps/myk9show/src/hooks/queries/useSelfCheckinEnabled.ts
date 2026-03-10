/**
 * useSelfCheckinEnabled — Resolves the self-check-in cascade for a class.
 *
 * Cascade: class.self_checkin_enabled ?? trial.self_checkin_enabled ?? show.self_checkin_enabled ?? true
 * Uses a raw query since self_checkin_enabled may not be in the generated Supabase types.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

interface SelfCheckinResult {
  /** Whether self-check-in is enabled for this class */
  enabled: boolean;
  /** Human-readable reason when disabled (undefined when enabled) */
  reason: string | undefined;
  isLoading: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bypass generated types for columns not yet in codegen
const untypedSupabase = supabase as any;

/**
 * Resolve self-check-in eligibility for a single class via raw SQL.
 * Returns the effective cascade result: class ?? trial ?? show ?? true.
 */
async function fetchSelfCheckinEnabled(classId: string): Promise<boolean> {
  // Try the DB function first (added by migration 036)
  const { data, error } = await untypedSupabase
    .rpc('get_effective_self_checkin', { p_class_id: classId })
    .single();

  if (!error && data !== null && data !== undefined) {
    return Boolean(data);
  }

  // Fallback: manual cascade query
  const { data: rows } = await untypedSupabase
    .from('classes')
    .select(
      'self_checkin_enabled, trials!inner(self_checkin_enabled, shows!inner(self_checkin_enabled))'
    )
    .eq('id', classId)
    .single();

  if (!rows) return true;

  const classSetting = rows.self_checkin_enabled as boolean | null;
  const trial = rows.trials as Record<string, unknown> | undefined;
  const trialSetting = trial?.self_checkin_enabled as boolean | null;
  const show = trial?.shows as Record<string, unknown> | undefined;
  const showSetting = show?.self_checkin_enabled as boolean | null;

  if (classSetting !== null && classSetting !== undefined) return classSetting;
  if (trialSetting !== null && trialSetting !== undefined) return trialSetting;
  if (showSetting !== null && showSetting !== undefined) return showSetting;
  return true;
}

export function useSelfCheckinEnabled(classId: string | null): SelfCheckinResult {
  const { data, isLoading } = useQuery({
    queryKey: ['classes', classId, 'selfCheckin'],
    queryFn: () => fetchSelfCheckinEnabled(classId!),
    enabled: !!classId,
    staleTime: 5 * 60 * 1000, // 5 min — rarely changes mid-show
    gcTime: 10 * 60 * 1000,
  });

  const enabled = data ?? true; // default to enabled while loading

  return {
    enabled,
    reason: enabled ? undefined : 'Check-in disabled by show management',
    isLoading,
  };
}
