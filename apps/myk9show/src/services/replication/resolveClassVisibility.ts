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

const VISIBILITY_COLUMNS =
  'preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled';
// Bound URL size and stay below PostgREST's row cap even for unscoped syncs.
const VISIBILITY_BATCH_SIZE = 100;

type ClassScopeRow = { id: string | number; trial_id?: string | null };

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
 * Resolve each class's OWN trial/show cascade with four bounded reads per batch,
 * not four serial reads per trial. No cross-sync cache: permission or settings
 * changes are read afresh. The caller preserves cached values on read failure.
 */
export async function resolveVisibilityForClassRows(
  rows: ClassScopeRow[]
): Promise<Map<string, ResolvedClassVisibility>> {
  const result = new Map<string, ResolvedClassVisibility>();
  const scopedRows = [
    ...new Map(rows.filter(row => row.trial_id).map(row => [String(row.id), row])).values(),
  ];
  for (let offset = 0; offset < scopedRows.length; offset += VISIBILITY_BATCH_SIZE) {
    const batch = scopedRows.slice(offset, offset + VISIBILITY_BATCH_SIZE);
    const trialIds = [...new Set(batch.map(row => String(row.trial_id)))];
    const trials = await readRows<{ id: string; show_id: string | null }>(
      'trials',
      'id, show_id',
      'id',
      trialIds
    );
    const showIds = [...new Set(trials.flatMap(trial => (trial.show_id ? [trial.show_id] : [])))];
    const [shows, trialOverrides, classOverrides] = await Promise.all([
      readRows<VisRow & { show_id: string }>(
        'show_visibility_settings',
        `show_id, ${VISIBILITY_COLUMNS}`,
        'show_id',
        showIds
      ),
      readRows<VisRow & { trial_id: string }>(
        'trial_visibility_overrides',
        `trial_id, ${VISIBILITY_COLUMNS}`,
        'trial_id',
        trialIds
      ),
      readRows<VisRow & { class_id: string }>(
        'class_visibility_overrides',
        `class_id, ${VISIBILITY_COLUMNS}`,
        'class_id',
        batch.map(row => String(row.id))
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

async function readRows<T>(
  table: string,
  columns: string,
  key: string,
  ids: string[]
): Promise<T[]> {
  if (ids.length === 0) return [];
  const { data, error } = await untypedSupabase.from(table).select(columns).in(key, ids);
  // A failed read is not a missing setting: do not replace cached restrictions
  // with enabled/open defaults during a transient backend failure.
  if (error) throw new Error(`Class visibility read failed: ${table}`);
  return (data ?? []) as T[];
}
