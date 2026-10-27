import { describe, expect, it } from 'vitest';
import {
  detectDirtyRowConflict,
  mergeNonConflictingServerFields,
  type DirtyRowComparePolicy,
} from './detectDirtyRowConflict';

// MYK9-1451: a field the remote row does not know (a failed lookup left it absent) is not a
// server change, on the detect path and the merge path alike.
const RETAIN_COUNT: DirtyRowComparePolicy = {
  retainLocal: (field, remoteRow) => field === 'count' && remoteRow.counted !== true,
};

describe('DirtyRowComparePolicy.retainLocal (MYK9-1451)', () => {
  it('does not adopt a retained field from the remote on the 3-way merge', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', count: 3, room: 1 },
      local: { id: '1', count: 3, room: 1 },
      remote: { id: '1', count: undefined, room: 2 },
      comparePolicy: RETAIN_COUNT,
    });

    expect(result.merged).toEqual({ id: '1', count: 3, room: 2 });
    expect(result.appliedFields).toEqual(['room']);
  });

  it('adopts the field when the hook says the remote knows it', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', count: 3 },
      local: { id: '1', count: 3 },
      remote: { id: '1', count: undefined, counted: true },
      comparePolicy: RETAIN_COUNT,
    });

    expect(result.merged.count).toBeUndefined();
    expect(result.appliedFields).toContain('count');
  });

  it('adopts the field when no hook is given (old behaviour)', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', count: 3 },
      local: { id: '1', count: 3 },
      remote: { id: '1', count: undefined },
    });

    expect(result.appliedFields).toEqual(['count']);
  });

  it('is not a same-field conflict when the device changed the retained field', () => {
    type Row = { id: string; count?: number | undefined };
    const input: { base: Row; local: Row; remote: Row } = {
      base: { id: '1', count: 3 },
      local: { id: '1', count: 5 },
      remote: { id: '1', count: undefined },
    };

    expect(detectDirtyRowConflict({ ...input, comparePolicy: RETAIN_COUNT })).toEqual({
      hasConflict: false,
      fields: [],
    });
    expect(detectDirtyRowConflict(input).hasConflict).toBe(true);
  });

  it('still reports a conflict on a field the hook does not retain', () => {
    const result = detectDirtyRowConflict({
      base: { id: '1', count: 3, room: 1 },
      local: { id: '1', count: 3, room: 2 },
      remote: { id: '1', count: undefined, room: 3 },
      comparePolicy: RETAIN_COUNT,
    });

    expect(result.fields).toEqual(['room']);
  });
});
