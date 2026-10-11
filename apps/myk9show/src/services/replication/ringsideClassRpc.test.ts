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
