import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../stores/entryStore';
import {
  areDogsAheadEqual,
  areEntriesEqual,
  areSortableEntryCardPropsEqual,
} from './sortableEntryCardMemo';
import type { SortableEntryCardProps } from './SortableEntryCard';

const entry = (overrides: Partial<Entry> = {}): Entry =>
  ({
    id: 'e1',
    armband: 7,
    callName: 'Rex',
    status: 'no-status',
    isScored: false,
    ...overrides,
  }) as unknown as Entry;

const props = (overrides: Partial<SortableEntryCardProps> = {}): SortableEntryCardProps =>
  ({
    entry: entry(),
    isDragMode: false,
    hasPermission: () => true,
    handleEntryClick: vi.fn(),
    ...overrides,
  }) as unknown as SortableEntryCardProps;

describe('areEntriesEqual', () => {
  it('treats a rebuilt row with the same values as equal', () => {
    expect(areEntriesEqual(entry(), entry())).toBe(true);
  });

  it.each([
    ['status', { status: 'checked-in' }],
    ['isScored', { isScored: true }],
    ['a newly present field', { placement: 1 }],
  ] as const)('sees a change in %s', (_label, change) => {
    expect(areEntriesEqual(entry(), entry(change as Partial<Entry>))).toBe(false);
  });
});

describe('areDogsAheadEqual', () => {
  it('compares by value', () => {
    expect(
      areDogsAheadEqual({ kind: 'waiting', dogsAhead: 2 }, { kind: 'waiting', dogsAhead: 2 })
    ).toBe(true);
    expect(
      areDogsAheadEqual({ kind: 'waiting', dogsAhead: 2 }, { kind: 'waiting', dogsAhead: 1 })
    ).toBe(false);
    expect(areDogsAheadEqual({ kind: 'in-ring' }, { kind: 'waiting', dogsAhead: 0 })).toBe(false);
    expect(areDogsAheadEqual({ kind: 'in-ring' }, { kind: 'in-ring' })).toBe(true);
    expect(areDogsAheadEqual(null, undefined)).toBe(true);
    expect(areDogsAheadEqual(null, { kind: 'in-ring' })).toBe(false);
  });
});

describe('areSortableEntryCardPropsEqual', () => {
  it('ignores a rebuilt entry with the same values', () => {
    const base = props();
    expect(areSortableEntryCardPropsEqual(base, { ...base, entry: entry() })).toBe(true);
  });

  it('re-renders on a changed entry, flag or callback identity', () => {
    const base = props();
    expect(
      areSortableEntryCardPropsEqual(base, { ...base, entry: entry({ status: 'at-gate' }) })
    ).toBe(false);
    expect(areSortableEntryCardPropsEqual(base, { ...base, isDragMode: true })).toBe(false);
    expect(areSortableEntryCardPropsEqual(base, { ...base, handleEntryClick: vi.fn() })).toBe(
      false
    );
    expect(areSortableEntryCardPropsEqual(base, { ...base, isOwnEntry: true })).toBe(false);
  });
});
