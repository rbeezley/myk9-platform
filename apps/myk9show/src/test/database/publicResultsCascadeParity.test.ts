import { describe, expect, it } from 'vitest';
import {
  resolvePreset,
  getVisibleResultFields,
  type ClassState,
  type VisibilityPreset,
  type VisibilityTiming,
} from '@myk9/secretary';

/**
 * Parity guard: the SQL functions in migration 20260616120000
 * (_result_visibility_preset + _result_timing_visible, consumed by
 * resolve_class_result_visibility and view_public_entry_results) reproduce the
 * canonical TypeScript visibility cascade. These TS ports MUST mirror the SQL
 * verbatim; if the SQL changes, update them here. The assertions then prove the
 * ported truth-table equals @myk9/secretary's getVisibleResultFields — so the
 * database gate matches what the client believes is public.
 */

// Mirror of SQL public._result_visibility_preset(p_preset, p_field)
function sqlPresetTiming(preset: VisibilityPreset, field: string): VisibilityTiming {
  switch (preset) {
    case 'open':
      return field === 'placement' ? 'class_complete' : 'immediate';
    case 'standard':
      return field === 'qualification' ? 'immediate' : 'class_complete';
    case 'review':
      return 'manual_release';
  }
}

// Mirror of SQL public._result_timing_visible(p_timing, p_state)
function sqlTimingVisible(timing: VisibilityTiming, state: ClassState): boolean {
  switch (timing) {
    case 'immediate':
      return true;
    case 'class_complete':
      return state === 'completed' || state === 'released';
    case 'manual_release':
      return state === 'released';
    default:
      return false;
  }
}

const PRESETS: VisibilityPreset[] = ['open', 'standard', 'review'];
const STATES: ClassState[] = ['in_progress', 'completed', 'released'];
const FIELDS = ['placement', 'qualification', 'time', 'faults'] as const;

describe('public results cascade — SQL/TS parity', () => {
  for (const preset of PRESETS) {
    for (const state of STATES) {
      it(`preset=${preset} state=${state} matches canonical getVisibleResultFields`, () => {
        const canonical = getVisibleResultFields(resolvePreset(preset, 'show'), state, 'exhibitor');
        const sql = {
          showPlacement: sqlTimingVisible(sqlPresetTiming(preset, 'placement'), state),
          showQualification: sqlTimingVisible(sqlPresetTiming(preset, 'qualification'), state),
          showTime: sqlTimingVisible(sqlPresetTiming(preset, 'time'), state),
          showFaults: sqlTimingVisible(sqlPresetTiming(preset, 'faults'), state),
        };
        expect(sql).toEqual(canonical);
      });
    }
  }

  it('review preset hides ALL fields until released (the manual-release gate)', () => {
    for (const field of FIELDS) {
      expect(sqlTimingVisible(sqlPresetTiming('review', field), 'in_progress')).toBe(false);
      expect(sqlTimingVisible(sqlPresetTiming('review', field), 'completed')).toBe(false);
      expect(sqlTimingVisible(sqlPresetTiming('review', field), 'released')).toBe(true);
    }
  });

  it('open preset (DB default) keeps placement private until the class completes', () => {
    expect(sqlTimingVisible(sqlPresetTiming('open', 'placement'), 'in_progress')).toBe(false);
    expect(sqlTimingVisible(sqlPresetTiming('open', 'placement'), 'completed')).toBe(true);
    // ...but Q/time/faults are immediate
    expect(sqlTimingVisible(sqlPresetTiming('open', 'qualification'), 'in_progress')).toBe(true);
  });
});
