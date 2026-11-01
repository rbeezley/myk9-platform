import { describe, it, expect } from 'vitest';
import { buildRingsideClassRpc, RINGSIDE_CLASS_RPC_FUNCTION } from './ringsideClassRpc';

const row = {
  id: 'class-1',
  status: 'in_progress',
  start_time: '09:30',
  time_limit_seconds: 150,
  name: 'Interior Novice A',
  updated_at: '2026-10-11T00:00:00Z',
};

describe('buildRingsideClassRpc (MYK9-1086 / MYK9-1096)', () => {
  it('routes a ringside status change through ringside_update_class', () => {
    expect(buildRingsideClassRpc(['classStatus', 'startTime'], row)).toEqual({
      name: RINGSIDE_CLASS_RPC_FUNCTION,
      idParam: 'p_class_id',
      fields: { status: 'in_progress', start_time: '09:30' },
    });
  });

  it('routes a max time change, including a clear to null', () => {
    expect(buildRingsideClassRpc(['timeLimitSeconds'], row)?.fields).toEqual({
      time_limit_seconds: 150,
    });
    expect(
      buildRingsideClassRpc(['timeLimitSeconds'], { ...row, time_limit_seconds: null })?.fields
    ).toEqual({ time_limit_seconds: null });
  });

  it('routes a status with its ring phase, phase time and Expected start (MYK9-1513)', () => {
    expect(
      buildRingsideClassRpc(['classStatus', 'ringPhase', 'ringPhaseTime'], {
        ...row,
        ring_phase: 'break',
        ring_phase_time: '10:30:00',
      })?.fields
    ).toEqual({ status: 'in_progress', ring_phase: 'break', ring_phase_time: '10:30:00' });
    expect(
      buildRingsideClassRpc(['classStatus', 'ringPhase', 'ringPhaseTime'], {
        ...row,
        status: 'completed',
      })?.fields
    ).toEqual({ status: 'completed', ring_phase: null, ring_phase_time: null });
    expect(
      buildRingsideClassRpc(['classStatus', 'revisedExpectedStart'], {
        ...row,
        status: 'upcoming',
        revised_expected_start: '2026-11-01T15:00:00.000Z',
      })?.fields
    ).toEqual({ status: 'upcoming', revised_expected_start: '2026-11-01T15:00:00.000Z' });
  });

  it('routes per-area max times (MYK9-1098)', () => {
    expect(
      buildRingsideClassRpc(
        ['timeLimitSeconds', 'timeLimitArea2Seconds', 'timeLimitArea3Seconds'],
        {
          ...row,
          time_limit_area2_seconds: 120,
          time_limit_area3_seconds: 90,
        }
      )?.fields
    ).toEqual({
      time_limit_seconds: 150,
      time_limit_area2_seconds: 120,
      time_limit_area3_seconds: 90,
    });
  });

  it('routes the area count a judge chooses (MYK9-1625)', () => {
    expect(buildRingsideClassRpc(['areaCount'], { ...row, num_areas: 2 })?.fields).toEqual({
      num_areas: 2,
    });
  });

  it('ignores bookkeeping keys when deciding', () => {
    expect(
      buildRingsideClassRpc(['classStatus', '_lastModified', '_syncStatus'], row)?.fields
    ).toEqual({
      status: 'in_progress',
    });
  });

  it('leaves any write touching another column on the direct path', () => {
    expect(buildRingsideClassRpc(['classStatus', 'className'], row)).toBeNull();
    expect(buildRingsideClassRpc([], row)).toBeNull();
  });

  it('leaves cancelling a class on the direct (manager) path', () => {
    expect(buildRingsideClassRpc(['classStatus'], { ...row, status: 'cancelled' })).toBeNull();
  });
});
