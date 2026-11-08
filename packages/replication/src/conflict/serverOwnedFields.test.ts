import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict } from './detectDirtyRowConflict';

const policy = { serverOwnedFields: ['stamp'] as const };

describe('serverOwnedFields (MYK9-1757)', () => {
  it('never reports a server-owned field as a conflict, and adopts the server value', () => {
    const result = detectDirtyRowConflict({
      base: { id: 'r', status: 'a', stamp: 'x' },
      local: { id: 'r', status: 'b', stamp: 'y' },
      remote: { id: 'r', status: 'b', stamp: 'z' },
      comparePolicy: policy,
    });
    expect(result).toEqual({ hasConflict: false, fields: [], adoptRemoteFields: ['stamp'] });
  });

  it('still reports a real collision on another field', () => {
    const result = detectDirtyRowConflict({
      base: { id: 'r', status: 'a', stamp: 'x' },
      local: { id: 'r', status: 'b', stamp: 'y' },
      remote: { id: 'r', status: 'c', stamp: 'z' },
      comparePolicy: policy,
    });
    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(['status']);
  });

  it('without the policy the same stamp difference is a conflict', () => {
    const result = detectDirtyRowConflict({
      base: { id: 'r', stamp: 'x' },
      local: { id: 'r', stamp: 'y' },
      remote: { id: 'r', stamp: 'z' },
    });
    expect(result.fields).toEqual(['stamp']);
  });
});
