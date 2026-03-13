/**
 * useSelfCheckinEnabled — Resolves the self-check-in cascade for a class.
 *
 * Cascade: class.self_checkin_enabled ?? trial.self_checkin_enabled ?? show.self_checkin_enabled ?? true
 * Now reads from show_visibility_settings / trial_visibility_overrides / class_visibility_overrides tables.
 *
 * Note: these tables are added by migration 007 and are not yet in the
 * generated Supabase types, so we use `untypedSupabase` to bypass codegen.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { resolveCheckinCascade } from '@myk9/secretary';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bypass generated types for tables not yet in codegen
const untypedSupabase = supabase as any;

interface SelfCheckinResult {
  /** Whether self-check-in is enabled for this class */
  enabled: boolean;
  /** Human-readable reason when disabled (undefined when enabled) */
  reason: string | undefined;
  isLoading: boolean;
}

/**
 * Fetch the cascade values and resolve locally.
 * Queries the class's trial and show to get IDs, then fetches all three settings rows.
 */
async function fetchSelfCheckinEnabled(classId: string): Promise<boolean> {
  // Get the class's trial and show IDs
  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select('trial_id, trials!inner(show_id)')
    .eq('id', classId)
    .single();

  if (classError || !classRow) return true; // safe default

  const trialId = classRow.trial_id;
  const showId = (classRow.trials as { show_id: string }).show_id;

  // Fetch all three levels in parallel
  const [showResult, trialResult, classResult] = await Promise.all([
    untypedSupabase
      .from('show_visibility_settings')
      .select('self_checkin_enabled')
      .eq('show_id', showId)
      .maybeSingle(),
    untypedSupabase
      .from('trial_visibility_overrides')
      .select('self_checkin_enabled')
      .eq('trial_id', trialId)
      .maybeSingle(),
    untypedSupabase
      .from('class_visibility_overrides')
      .select('self_checkin_enabled')
      .eq('class_id', classId)
      .maybeSingle(),
  ]);

  const showCheckin =
    (showResult.data as { self_checkin_enabled: boolean | null } | null)?.self_checkin_enabled ??
    null;
  const trialCheckin =
    (trialResult.data as { self_checkin_enabled: boolean | null } | null)?.self_checkin_enabled ??
    null;
  const classCheckin =
    (classResult.data as { self_checkin_enabled: boolean | null } | null)?.self_checkin_enabled ??
    null;

  return resolveCheckinCascade(showCheckin, trialCheckin, classCheckin);
}

/**
 * Batch version: resolves self-check-in cascade for multiple classes.
 * Uses useQueries so each class gets its own cached query (shared with useSelfCheckinEnabled).
 */
export function useSelfCheckinMap(classIds: string[]): Record<string, boolean> {
  const results = useQueries({
    queries: classIds.map(classId => ({
      queryKey: ['classes', classId, 'selfCheckin'],
      queryFn: () => fetchSelfCheckinEnabled(classId),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })),
  });

  const map: Record<string, boolean> = {};
  classIds.forEach((id, i) => {
    map[id] = results[i].data ?? true;
  });
  return map;
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
