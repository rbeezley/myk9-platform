/**
 * resolveClassVisibility — resolve the show/trial/class visibility cascade
 * (effective preset + self-check-in) for offline denormalization onto
 * ReplicatedClass (Phase 1h ClassDetailsPopover + the SortableEntryCard
 * self-check-in gate). Reuses `resolveCheckinCascade` (@myk9/secretary) — the
 * same resolver the online hooks use — so there's one definition of the cascade.
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
import type { Tables } from '@/types/supabase';
import type { ClassTrialRow } from './resolveClassTrials';

export interface ResolvedClassVisibility {
  selfCheckinEnabled: boolean;
  visibilityPreset: VisibilityPreset | 'custom';
}

type VisRow = Pick<
  | Tables<'show_visibility_settings'>
  | Tables<'trial_visibility_overrides'>
  | Tables<'class_visibility_overrides'>,
  | 'preset'
  | 'placement_timing'
  | 'qualification_timing'
  | 'time_timing'
  | 'faults_timing'
  | 'self_checkin_enabled'
>;

const VISIBILITY_COLUMNS =
  'preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled';
// Bound URL size and stay below PostgREST's row cap even for unscoped syncs.
const VISIBILITY_BATCH_SIZE = 100;

type ClassScopeRow = { id: string | number; trial_id?: string | null };

function resolveTimingBase(row: VisRow | null): FieldTimings {
  if (!row) return { ...PRESET_CONFIGS.open };
  const preset = (row.preset as VisibilityPreset | null) ?? 'open';
  return applyTimingOverride({ ...PRESET_CONFIGS[preset] }, row);
}

function applyTimingOverride(base: FieldTimings, row: VisRow | null | undefined): FieldTimings {
  if (!row) return base;

  const preset = row.preset as VisibilityPreset | null;
  const fromPreset = preset ? { ...PRESET_CONFIGS[preset] } : { ...base };
  return {
    placement: (row.placement_timing as VisibilityTiming | null) ?? fromPreset.placement,
    qualification:
      (row.qualification_timing as VisibilityTiming | null) ?? fromPreset.qualification,
    time: (row.time_timing as VisibilityTiming | null) ?? fromPreset.time,
    faults: (row.faults_timing as VisibilityTiming | null) ?? fromPreset.faults,
  };
}

/**
 * Resolve each class's OWN trial/show cascade with four bounded reads per batch,
 * not four serial reads per trial. No cross-sync cache: permission or settings
 * changes are read afresh. The caller preserves cached values on read failure.
 */
export async function resolveVisibilityForClassRows(
  rows: ClassScopeRow[],
  preloadedTrials?: ReadonlyArray<ClassTrialRow>
): Promise<Map<string, ResolvedClassVisibility>> {
  const result = new Map<string, ResolvedClassVisibility>();
  const scopedRows = [
    ...new Map(rows.filter(row => row.trial_id).map(row => [String(row.id), row])).values(),
  ];
  for (let offset = 0; offset < scopedRows.length; offset += VISIBILITY_BATCH_SIZE) {
    const batch = scopedRows.slice(offset, offset + VISIBILITY_BATCH_SIZE);
    const trialIds = [...new Set(batch.map(row => String(row.trial_id)))];
    const classIds = batch.map(row => String(row.id));
    // The shared read covers every batch's trials; keep this batch's.
    const trials: ReadonlyArray<{ id: string; show_id: string | null }> = preloadedTrials
      ? preloadedTrials.filter(trial => trialIds.includes(trial.id))
      : await readBatch('trials', trialIds, () =>
          supabase.from('trials').select('id, show_id').in('id', trialIds)
        );
    const showIds = [...new Set(trials.flatMap(trial => (trial.show_id ? [trial.show_id] : [])))];
    const [shows, trialOverrides, classOverrides] = await Promise.all([
      readBatch('show_visibility_settings', showIds, () =>
        supabase
          .from('show_visibility_settings')
          .select(`show_id, ${VISIBILITY_COLUMNS}`)
          .in('show_id', showIds)
      ),
      readBatch('trial_visibility_overrides', trialIds, () =>
        supabase
          .from('trial_visibility_overrides')
          .select(`trial_id, ${VISIBILITY_COLUMNS}`)
          .in('trial_id', trialIds)
      ),
      readBatch('class_visibility_overrides', classIds, () =>
        supabase
          .from('class_visibility_overrides')
          .select(`class_id, ${VISIBILITY_COLUMNS}`)
          .in('class_id', classIds)
      ),
    ]);
    const showByTrial = new Map(trials.map(trial => [trial.id, trial.show_id]));
    const showById = new Map(shows.map(show => [show.show_id, show]));
    const trialById = new Map(trialOverrides.map(trial => [trial.trial_id, trial]));
    const classById = new Map(classOverrides.map(cls => [cls.class_id, cls]));
    for (const row of batch) {
      const classId = String(row.id);
      const trialId = String(row.trial_id);
      const show = showById.get(showByTrial.get(trialId) ?? '') ?? null;
      const trial = trialById.get(trialId);
      const cls = classById.get(classId);
      const timings = applyTimingOverride(applyTimingOverride(resolveTimingBase(show), trial), cls);
      result.set(classId, {
        visibilityPreset: detectPreset(timings) ?? 'custom',
        selfCheckinEnabled: resolveCheckinCascade(
          show?.self_checkin_enabled ?? null,
          trial?.self_checkin_enabled ?? null,
          cls?.self_checkin_enabled ?? null
        ),
      });
    }
  }
  return result;
}

async function readBatch<T>(
  table: string,
  ids: string[],
  query: () => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const { data, error } = await query();
  // A failed read is not a missing setting: do not replace cached restrictions
  // with enabled/open defaults during a transient backend failure.
  if (error) throw new Error(`Class visibility read failed: ${table}`);
  return data ?? [];
}
