import { describe, it, expect } from 'vitest';
import { entryInvalidationKeys } from './invalidation';
import { queryKeys } from '@/lib/queryClient';

describe('entryInvalidationKeys', () => {
  it('always includes the entries root key', () => {
    const keys = entryInvalidationKeys({});
    expect(keys).toContainEqual(queryKeys.entries);
  });

  it('includes entry detail key when entryId is provided', () => {
    const keys = entryInvalidationKeys({ entryId: 'e1' });
    expect(keys).toContainEqual(queryKeys.entry('e1'));
  });

  it('does not include entry detail key when entryId is absent', () => {
    const keys = entryInvalidationKeys({ showId: 's1' });
    expect(keys).not.toContainEqual(queryKeys.entry('e1'));
  });

  it('includes showEntries and checkInReport when showId is provided', () => {
    const keys = entryInvalidationKeys({ showId: 'show-1' });
    expect(keys).toContainEqual(queryKeys.showEntries('show-1'));
    expect(keys).toContainEqual(queryKeys.checkInReport('show-1'));
  });

  it('does not include show-scoped keys when showId is absent', () => {
    const keys = entryInvalidationKeys({ classId: 'c1' });
    expect(keys.some(k => JSON.stringify(k).includes('check-in-report'))).toBe(false);
  });

  it('includes classEntries and raw classes key when classId is provided', () => {
    const keys = entryInvalidationKeys({ classId: 'cls-1' });
    expect(keys).toContainEqual(queryKeys.classEntries('cls-1'));
    expect(keys).toContainEqual(['classes', 'cls-1', 'entries']);
  });

  it('includes dogEntries when dogId is provided', () => {
    const keys = entryInvalidationKeys({ dogId: 'dog-1' });
    expect(keys).toContainEqual(queryKeys.dogEntries('dog-1'));
  });

  it('emits full set for a fully-specified change', () => {
    const keys = entryInvalidationKeys({
      entryId: 'e1',
      showId: 's1',
      classId: 'c1',
      dogId: 'd1',
    });
    expect(keys).toContainEqual(queryKeys.entries);
    expect(keys).toContainEqual(queryKeys.entry('e1'));
    expect(keys).toContainEqual(queryKeys.showEntries('s1'));
    expect(keys).toContainEqual(queryKeys.checkInReport('s1'));
    expect(keys).toContainEqual(queryKeys.classEntries('c1'));
    expect(keys).toContainEqual(['classes', 'c1', 'entries']);
    expect(keys).toContainEqual(queryKeys.dogEntries('d1'));
    expect(keys).toHaveLength(7);
  });

  it('emits only root key for empty change descriptor', () => {
    const keys = entryInvalidationKeys({});
    expect(keys).toHaveLength(1);
    expect(keys).toContainEqual(queryKeys.entries);
  });
});
