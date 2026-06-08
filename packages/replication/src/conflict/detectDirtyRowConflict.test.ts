import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict } from './detectDirtyRowConflict';

describe('detectDirtyRowConflict', () => {
  it('returns changed fields when local and remote changed the same field from base', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'absent', resultStatus: 'pending' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['checkInStatus'] });
  });

  it('does not conflict when local and remote changed different fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'no-status', resultStatus: 'qualified' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });

  it('ignores replication bookkeeping fields', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', updated_at: 'a', _syncStatus: 'synced' },
      local: { id: '1', updated_at: 'b', _syncStatus: 'pending' },
      remote: { id: '1', updated_at: 'c', _syncStatus: 'synced' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });
});
