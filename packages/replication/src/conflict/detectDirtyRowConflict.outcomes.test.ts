import { describe, expect, it } from 'vitest';
import {
  deepEqual,
  detectDirtyRowConflict,
  instantFieldsFor,
  mergeNonConflictingServerFields,
} from './detectDirtyRowConflict';

const lowerCase = (_field: string, value: unknown) =>
  typeof value === 'string' ? value.toLowerCase() : value;

describe('detectDirtyRowConflict result ordering', () => {
  it('lists conflicting fields sorted, whatever order the row stores them in', () => {
    const result = detectDirtyRowConflict({
      base: { zeta: 0, alpha: 0, mid: 0 },
      local: { zeta: 1, alpha: 1, mid: 1 },
      remote: { zeta: 2, alpha: 2, mid: 2 },
    });

    expect(result.fields).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('lists adopted respelled fields sorted when the row reconciles', () => {
    const result = detectDirtyRowConflict({
      base: { zeta: 'open', alpha: 'open' },
      local: { zeta: 'Done', alpha: 'Done' },
      remote: { zeta: 'done', alpha: 'done' },
      comparePolicy: { normalizeValue: lowerCase },
    });

    expect(result).toEqual({
      hasConflict: false,
      fields: [],
      adoptRemoteFields: ['alpha', 'zeta'],
    });
  });

  it('a surfaced conflict carries no adoptRemoteFields even when other fields were respelled', () => {
    const result = detectDirtyRowConflict({
      base: { zeta: 'open', mid: 0 },
      local: { zeta: 'Done', mid: 1 },
      remote: { zeta: 'done', mid: 2 },
      comparePolicy: { normalizeValue: lowerCase },
    });

    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(['mid']);
    expect('adoptRemoteFields' in result).toBe(false);
  });
});

describe('detectDirtyRowConflict serverWinsFields waiver', () => {
  const policy = { serverWinsFields: ['completed_at'] };

  it('waives a server-wins collision beside a converged field, adopting everything sorted', () => {
    const result = detectDirtyRowConflict({
      base: { status: 'a', completed_at: 'x', owned: 'o', zed: 'open' },
      local: { status: 'b', completed_at: 'y', owned: 'old', zed: 'Done' },
      remote: { status: 'b', completed_at: 'z', owned: 'new', zed: 'done' },
      comparePolicy: { ...policy, serverOwnedFields: ['owned'], normalizeValue: lowerCase },
    });

    expect(result).toEqual({
      hasConflict: false,
      fields: [],
      adoptRemoteFields: ['completed_at', 'owned', 'zed'],
    });
  });

  it('does not waive when any colliding field is not server-wins', () => {
    const result = detectDirtyRowConflict({
      base: { status: 'a', completed_at: 'x', note: 'n' },
      local: { status: 'b', completed_at: 'y', note: 'l' },
      remote: { status: 'b', completed_at: 'z', note: 'r' },
      comparePolicy: policy,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.fields).toEqual(['completed_at', 'note']);
  });

  it('does not waive a server-wins collision with no converged field beside it', () => {
    const result = detectDirtyRowConflict({
      base: { completed_at: 'x' },
      local: { completed_at: 'y' },
      remote: { completed_at: 'z' },
      comparePolicy: policy,
    });

    expect(result).toEqual({ hasConflict: true, fields: ['completed_at'] });
  });
});

describe('detectDirtyRowConflict serverOwnedFields', () => {
  const comparePolicy = { serverOwnedFields: ['stamp'] };

  it('adopts a server-owned field the device copy has drifted on', () => {
    const result = detectDirtyRowConflict({
      base: { stamp: 'a' },
      local: { stamp: 'b' },
      remote: { stamp: 'c' },
      comparePolicy,
    });

    expect(result).toEqual({ hasConflict: false, fields: [], adoptRemoteFields: ['stamp'] });
  });

  it('adopts nothing when the device copy already equals the server', () => {
    const result = detectDirtyRowConflict({
      base: { stamp: 'a' },
      local: { stamp: 'c' },
      remote: { stamp: 'c' },
      comparePolicy,
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
    expect('adoptRemoteFields' in result).toBe(false);
  });

  it('reads a server-owned field as text: another spelling of one instant is adopted', () => {
    const result = detectDirtyRowConflict({
      base: { stamp: '2024-01-01T00:00:00Z' },
      local: { stamp: '2025-01-01T10:00:00Z' },
      remote: { stamp: '2025-01-01T10:00:00+00:00' },
      instantFields: new Set(['stamp']),
      comparePolicy,
    });

    expect(result.adoptRemoteFields).toEqual(['stamp']);
  });

  it('with no serverOwnedFields, a field named like a placeholder is an ordinary field', () => {
    const result = detectDirtyRowConflict({
      base: { 'Stryker was here': 'a' },
      local: { 'Stryker was here': 'b' },
      remote: { 'Stryker was here': 'c' },
    });

    expect(result).toEqual({ hasConflict: true, fields: ['Stryker was here'] });
  });
});

describe('deepEqual', () => {
  it('equal content behind different references is equal', () => {
    expect(deepEqual({ a: [1, 2] }, { a: [1, 2] }, false)).toBe(true);
    expect(deepEqual([1, 2], [1, 2], false)).toBe(true);
  });

  it('different content is not equal', () => {
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] }, false)).toBe(false);
    expect(deepEqual('a', 'b', false)).toBe(false);
    expect(deepEqual(1, '1', false)).toBe(false);
  });

  it('the same value is equal, including NaN and undefined', () => {
    expect(deepEqual(NaN, NaN, false)).toBe(true);
    expect(deepEqual(undefined, undefined, false)).toBe(true);
    expect(deepEqual(null, null, false)).toBe(true);
  });

  it('instants equal only when asked to compare as instants', () => {
    expect(deepEqual('2025-01-01T10:00:00Z', '2025-01-01T10:00:00+00:00', true)).toBe(true);
    expect(deepEqual('2025-01-01T10:00:00Z', '2025-01-01T10:00:00+00:00', false)).toBe(false);
  });
});

describe('detectDirtyRowConflict with object values', () => {
  it('a rebuilt but identical object on the device is not a change', () => {
    const result = detectDirtyRowConflict({
      base: { tags: ['a'] },
      local: { tags: ['a'] },
      remote: { tags: ['b'] },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });
});

describe('mergeNonConflictingServerFields', () => {
  it('lists applied fields sorted', () => {
    const result = mergeNonConflictingServerFields({
      base: { zeta: 0, alpha: 0, mine: 0 },
      local: { zeta: 0, alpha: 0, mine: 5 },
      remote: { zeta: 1, alpha: 1, mine: 0 },
    });

    expect(result.appliedFields).toEqual(['alpha', 'zeta']);
    expect(result.merged).toEqual({ zeta: 1, alpha: 1, mine: 5 });
  });

  it('never adopts a default-ignored field', () => {
    const result = mergeNonConflictingServerFields({
      base: { _version: 1 },
      local: { _version: 1 },
      remote: { _version: 2 },
    });

    expect(result).toEqual({ merged: { _version: 1 }, appliedFields: [] });
  });

  it('does not treat another spelling of one instant as a server change', () => {
    const result = mergeNonConflictingServerFields({
      base: { submitted_at: '2025-01-01T10:00:00Z' },
      local: { submitted_at: '2025-01-01T10:00:00Z' },
      remote: { submitted_at: '2025-01-01T10:00:00+00:00' },
      instantFields: instantFieldsFor('entries'),
    });

    expect(result.appliedFields).toEqual([]);
  });
});
