/**
 * resolveClassVisibility — resolve the show/trial/class visibility cascade
 * (effective preset + self-check-in) for offline denormalization onto
 * ReplicatedClass (Phase 1h ClassDetailsPopover + the SortableEntryCard
 * self-check-in gate). Reuses `resolveCheckinCascade` (@myk9/secretary) — the
 * same resolver the online hooks use — so there's one definition of the cascade.
 *
 * The *_visibility_settings / *_visibility_overrides tables aren't in the
 * generated Supabase types (migration 007), so reads use an untyped client —
 * same pattern as `useSelfCheckinEnabled`.
 */

import {
  detectPreset,
  PRESET_CONFIGS,
  resolveCheckinCascade,
  type FieldTimings,
  type VisibilityPreset,
  type VisibilityTiming,
} from '@myk9/secretary';
import { supabase } from '@/services/database/supabaseClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables absent from codegen
const untypedSupabase = supabase as any;

export interface ResolvedClassVisibility {
  selfCheckinEnabled: boolean;
  visibilityPreset: VisibilityPreset | 'custom';
}

type VisRow = {
  preset: VisibilityPreset | null;
  placement_timing?: VisibilityTiming | null;
  qualification_timing?: VisibilityTiming | null;
  time_timing?: VisibilityTiming | null;
  faults_timing?: VisibilityTiming | null;
  self_checkin_enabled: boolean | null;
};

/**
 * Resolve the cascade for a batch of classes that all belong to `trialId`.
 * Preset cascade is last-non-null wins (class → trial → show → 'open');
 * self-check-in via `resolveCheckinCascade`. Falls back to enabled/'open' when
 * a level is missing. Returns a map keyed by classId. Exported for tests.
 */
export async function resolveClassVisibilityForTrial(
  trialId: string,
  classIds: string[]
): Promise<Map<string, ResolvedClassVisibility>> {
  const result = new Map<string, ResolvedClassVisibility>();
  if (classIds.length === 0) return result;

  // The show-level row is the cascade base; derive the show id from the trial.
  const { data: trialRow } = await supabase
    .from('trials')
    .select('show_id')
    .eq('id', trialId)
    .maybeSingle();
  const showId = (trialRow as { show_id: string } | null)?.show_id;

  const [showRes, trialRes, classRes] = await Promise.all([
    showId
      ? untypedSupabase
          .from('show_visibility_settings')
          .select(
            'preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled'
          )
          .eq('show_id', showId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    untypedSupabase
      .from('trial_visibility_overrides')
      .select(
        'preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled'
      )
      .eq('trial_id', trialId)
      .maybeSingle(),
    untypedSupabase
      .from('class_visibility_overrides')
      .select(
        'class_id, preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled'
      )
      .in('class_id', classIds),
  ]);

  const show = showRes.data as VisRow | null;
  const trial = trialRes.data as VisRow | null;
  const classRows = (classRes.data ?? []) as Array<VisRow & { class_id: string }>;
  const classById = new Map(classRows.map(r => [r.class_id, r]));
  const showTimings = resolveTimingBase(show);

  for (const classId of classIds) {
    const cls = classById.get(classId);
    const timings = applyTimingOverride(applyTimingOverride(showTimings, trial), cls);
    result.set(classId, {
      visibilityPreset: detectPreset(timings) ?? 'custom',
      selfCheckinEnabled: resolveCheckinCascade(
        show?.self_checkin_enabled ?? null,
        trial?.self_checkin_enabled ?? null,
        cls?.self_checkin_enabled ?? null
      ),
    });
  }
  return result;
}

function resolveTimingBase(row: VisRow | null): FieldTimings {
  if (!row) return { ...PRESET_CONFIGS.open };
  return applyTimingOverride({ ...PRESET_CONFIGS[row.preset ?? 'open'] }, row);
}

function applyTimingOverride(base: FieldTimings, row: VisRow | null | undefined): FieldTimings {
  if (!row) return base;

  const fromPreset = row.preset ? { ...PRESET_CONFIGS[row.preset] } : { ...base };
  return {
    placement: row.placement_timing ?? fromPreset.placement,
    qualification: row.qualification_timing ?? fromPreset.qualification,
    time: row.time_timing ?? fromPreset.time,
    faults: row.faults_timing ?? fromPreset.faults,
  };
}

/**
 * Resolve visibility for a batch of raw class rows, grouping by each row's OWN
 * `trial_id` (so it works for scoped AND unscoped syncs, independent of the sync
 * licenseKey). Returns a classId → resolved-visibility map. Rows without a
 * trial_id are skipped. The caller is responsible for best-effort error handling.
 */
export async function resolveVisibilityForClassRows(
  rows: Array<{ id: string | number; trial_id?: string | null }>
): Promise<Map<string, ResolvedClassVisibility>> {
  const classIdsByTrial = new Map<string, string[]>();
  for (const r of rows) {
    const tid = r.trial_id ? String(r.trial_id) : null;
    if (!tid) continue;
    const ids = classIdsByTrial.get(tid);
    if (ids) ids.push(String(r.id));
    else classIdsByTrial.set(tid, [String(r.id)]);
  }

  const result = new Map<string, ResolvedClassVisibility>();
  for (const [tid, classIds] of classIdsByTrial) {
    const resolved = await resolveClassVisibilityForTrial(tid, classIds);
    for (const [cid, vis] of resolved) result.set(cid, vis);
  }
  return result;
}
