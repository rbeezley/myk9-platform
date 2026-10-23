import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication';
import { hasLocalEntryForShowToday } from './useLocalEntryForShowToday.helpers';

const SHOW = { id: 'show-1', startDate: '2026-10-22', endDate: '2026-10-24', deletedAt: null };

function entry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return { id: 'entry-1', showId: 'show-1', handlerId: 'person-1', ...overrides };
}

function run(overrides: Partial<Parameters<typeof hasLocalEntryForShowToday>[0]> = {}): boolean {
  return hasLocalEntryForShowToday({
    personId: 'person-1',
    showId: 'show-1',
    today: '2026-10-23',
    show: SHOW,
    entries: [entry()],
    dogs: [],
    ...overrides,
  });
}

describe('hasLocalEntryForShowToday', () => {
  it('matches an entry the person handles', () => {
    expect(run()).toBe(true);
  });

  it('matches an entry for a dog the person owns', () => {
    expect(
      run({
        entries: [entry({ handlerId: 'someone-else', dogId: 'dog-1' })],
        dogs: [{ id: 'dog-1', ownerId: 'person-1' }],
      })
    ).toBe(true);
  });

  it('ignores an entry that is neither handled nor owned by the person', () => {
    expect(
      run({
        entries: [entry({ handlerId: 'someone-else', dogId: 'dog-1' })],
        dogs: [{ id: 'dog-1', ownerId: 'someone-else' }],
      })
    ).toBe(false);
  });

  it('excludes an entry for another show', () => {
    expect(run({ entries: [entry({ showId: 'show-2' })] })).toBe(false);
  });

  it('is false when the route show differs from the show row', () => {
    expect(run({ showId: 'show-2' })).toBe(false);
  });

  it('is false before the show starts', () => {
    expect(run({ today: '2026-10-21' })).toBe(false);
  });

  it('is false after the show ends', () => {
    expect(run({ today: '2026-10-25' })).toBe(false);
  });

  it('includes the start date', () => {
    expect(run({ today: '2026-10-22' })).toBe(true);
  });

  it('includes the end date', () => {
    expect(run({ today: '2026-10-24' })).toBe(true);
  });

  it('is false with no show row, no person, or no show id', () => {
    expect(run({ show: null })).toBe(false);
    expect(run({ personId: null })).toBe(false);
    expect(run({ showId: undefined })).toBe(false);
  });

  it('is false for a soft-deleted show', () => {
    expect(run({ show: { ...SHOW, deletedAt: '2026-10-01T00:00:00Z' } })).toBe(false);
  });

  it('mirrors the server RPC by skipping withdrawn, scratched and deleted entries', () => {
    expect(run({ entries: [entry({ entryStatus: 'withdrawn' })] })).toBe(false);
    expect(run({ entries: [entry({ entryStatus: 'scratched' })] })).toBe(false);
    expect(run({ entries: [entry({ deletedAt: '2026-10-01T00:00:00Z' })] })).toBe(false);
    expect(run({ entries: [entry({ entryStatus: 'confirmed' })] })).toBe(true);
  });
});
