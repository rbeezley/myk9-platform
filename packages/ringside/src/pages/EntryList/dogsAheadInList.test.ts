/**
 * Tests for computeDogsAheadInList / buildEntryListOwnership.
 *
 * The first test pins the locked semantic (user decision 2026-06-11): the
 * in-ring dog is EXCLUDED from the count, so "You're next" shows while a dog
 * is still running. This intentionally diverges from the legacy
 * computeDogsAhead convention — do not "fix" it back.
 */

import { describe, expect, it } from 'vitest';
import type { Entry } from '../../stores/entryStore';
import {
  buildEntryListOwnership,
  computeDogsAheadInList,
  formatDogsAheadInList,
} from './dogsAheadInList';

function entry(overrides: Partial<Entry> & { id: string; armband: number }): Entry {
  return {
    callName: `Dog ${overrides.armband}`,
    breed: 'Mixed Breed',
    handler: 'Handler',
    classId: 'class-1',
    className: 'Container Novice',
    isScored: false,
    status: undefined,
    ...overrides,
  } as unknown as Entry;
}

describe('computeDogsAheadInList', () => {
  it("shows You're next (0 ahead) while another dog is still in the ring", () => {
    const entries = [
      entry({ id: 'e1', armband: 1, status: 'in-ring' }),
      entry({ id: 'e2', armband: 2 }),
      entry({ id: 'e3', armband: 3 }),
    ];
    expect(computeDogsAheadInList(entries, 'e2')).toEqual({ kind: 'waiting', dogsAhead: 0 });
    expect(formatDogsAheadInList(computeDogsAheadInList(entries, 'e2'))).toBe("You're next");
    expect(computeDogsAheadInList(entries, 'e3')).toEqual({ kind: 'waiting', dogsAhead: 1 });
  });

  it('orders by exhibitorOrder with armband fallback', () => {
    const entries = [
      entry({ id: 'e1', armband: 9, exhibitorOrder: 1 }),
      entry({ id: 'e2', armband: 1, exhibitorOrder: 2 }),
      entry({ id: 'e3', armband: 5 }), // no exhibitorOrder → falls back to armband 5
    ];
    expect(computeDogsAheadInList(entries, 'e2')).toEqual({ kind: 'waiting', dogsAhead: 1 });
    expect(computeDogsAheadInList(entries, 'e3')).toEqual({ kind: 'waiting', dogsAhead: 2 });
  });

  it('excludes scored and pulled entries from the queue', () => {
    const entries = [
      entry({ id: 'e1', armband: 1, isScored: true }),
      entry({ id: 'e2', armband: 2, status: 'pulled' }),
      entry({ id: 'e3', armband: 3 }),
      entry({ id: 'e4', armband: 4 }),
    ];
    expect(computeDogsAheadInList(entries, 'e4')).toEqual({ kind: 'waiting', dogsAhead: 1 });
  });

  it('returns in-ring state for the own entry currently running', () => {
    const entries = [entry({ id: 'e1', armband: 1, status: 'in-ring' })];
    expect(computeDogsAheadInList(entries, 'e1')).toEqual({ kind: 'in-ring' });
    expect(formatDogsAheadInList({ kind: 'in-ring' })).toBe('In the ring');
  });

  it('honors the deprecated inRing flag the data adapter still sets', () => {
    const entries = [
      entry({ id: 'e1', armband: 1, inRing: true }),
      entry({ id: 'e2', armband: 2 }),
    ];
    expect(computeDogsAheadInList(entries, 'e1')).toEqual({ kind: 'in-ring' });
    expect(computeDogsAheadInList(entries, 'e2')).toEqual({ kind: 'waiting', dogsAhead: 0 });
  });

  it('returns null for scored, pulled, or missing targets', () => {
    const entries = [
      entry({ id: 'e1', armband: 1, isScored: true }),
      entry({ id: 'e2', armband: 2, status: 'pulled' }),
    ];
    expect(computeDogsAheadInList(entries, 'e1')).toBeNull();
    expect(computeDogsAheadInList(entries, 'e2')).toBeNull();
    expect(computeDogsAheadInList(entries, 'missing')).toBeNull();
    expect(formatDogsAheadInList(null)).toBeNull();
  });

  it('formats plural counts', () => {
    expect(formatDogsAheadInList({ kind: 'waiting', dogsAhead: 1 })).toBe('1 dog ahead');
    expect(formatDogsAheadInList({ kind: 'waiting', dogsAhead: 3 })).toBe('3 dogs ahead');
  });
});

describe('buildEntryListOwnership', () => {
  const entries = [
    entry({ id: 'e1', armband: 1 }),
    entry({ id: 'e2', armband: 2 }),
    entry({ id: 'e3', armband: 3 }),
  ];

  it('computes dogs-ahead only for own entries', () => {
    const bag = buildEntryListOwnership(entries, new Set(['e2']));
    expect(bag).toBeDefined();
    expect(bag?.dogsAheadByEntryId.get('e2')).toEqual({ kind: 'waiting', dogsAhead: 1 });
    expect(bag?.dogsAheadByEntryId.has('e1')).toBe(false);
  });

  it('returns undefined when the account owns nothing here', () => {
    expect(buildEntryListOwnership(entries, new Set())).toBeUndefined();
    expect(buildEntryListOwnership(entries, new Set(['not-in-class']))).toBeUndefined();
  });

  it('carries the conflict label map through', () => {
    const conflicts = new Map([['e2', 'Also 2 away in Container Master']]);
    const bag = buildEntryListOwnership(entries, new Set(['e2']), conflicts);
    expect(bag?.conflictLabelByEntryId?.get('e2')).toBe('Also 2 away in Container Master');
  });
});
