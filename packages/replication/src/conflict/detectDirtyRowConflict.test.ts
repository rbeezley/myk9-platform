import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict, mergeNonConflictingServerFields } from './detectDirtyRowConflict';

interface EntryLike {
  id: string;
  checkInStatus?: string;
  resultStatus?: string;
}

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

  it('accepts interface row types without requiring an index signature', () => {
    const result = detectDirtyRowConflict<EntryLike>({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'absent' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['checkInStatus'] });
  });
});

describe('mergeNonConflictingServerFields', () => {
  it('adopts a server-changed field the client never touched (the clobber-prevention case)', () => {
    // Client edited checkInStatus; server set resultStatus. Merge must keep the
    // local edit AND pull in the server field, so the next full-row write does not
    // regress resultStatus to its stale value.
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status', resultStatus: 'pending' },
      local: { id: '1', checkInStatus: 'checked-in', resultStatus: 'pending' },
      remote: { id: '1', checkInStatus: 'no-status', resultStatus: 'qualified' },
    });

    expect(result.merged).toEqual({ id: '1', checkInStatus: 'checked-in', resultStatus: 'qualified' });
    expect(result.appliedFields).toEqual(['resultStatus']);
  });

  it('keeps the local value when the client changed the field (does not let remote win)', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'no-status' },
    });

    expect(result.merged).toEqual({ id: '1', checkInStatus: 'checked-in' });
    expect(result.appliedFields).toEqual([]);
  });

  it('applies nothing when the server matches base (no remote change)', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', a: 1, b: 2 },
      local: { id: '1', a: 9, b: 2 },
      remote: { id: '1', a: 1, b: 2 },
    });

    expect(result.merged).toEqual({ id: '1', a: 9, b: 2 });
    expect(result.appliedFields).toEqual([]);
  });

  it('does NOT merge a same-field divergence (that is a conflict, handled elsewhere)', () => {
    // Both sides changed checkInStatus differently → not adopted here; the caller
    // routes this to detectDirtyRowConflict instead.
    const result = mergeNonConflictingServerFields({
      base: { id: '1', checkInStatus: 'no-status' },
      local: { id: '1', checkInStatus: 'checked-in' },
      remote: { id: '1', checkInStatus: 'absent' },
    });

    expect(result.merged).toEqual({ id: '1', checkInStatus: 'checked-in' });
    expect(result.appliedFields).toEqual([]);
  });

  it('ignores replication bookkeeping fields', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', updated_at: 'a' },
      local: { id: '1', updated_at: 'a' },
      remote: { id: '1', updated_at: 'c' },
    });

    expect(result.appliedFields).toEqual([]);
    expect(result.merged).toEqual({ id: '1', updated_at: 'a' });
  });
});
