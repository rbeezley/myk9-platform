import { getRunOrder } from '../runOrderUtils';
import type { ShowEntry } from '@/store/entry-store-types';

function makeEntry(
  overrides: Partial<ShowEntry> & { armband?: string; scored?: boolean }
): ShowEntry {
  const { armband, scored, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'confirmed',
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: armband ?? undefined,
    },
    competitionData: scored
      ? { recordedBy: 'judge', recordedAt: new Date().toISOString() }
      : undefined,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  } as ShowEntry;
}

describe('getRunOrder', () => {
  it('sorts entries by armband number ascending', () => {
    const entries = [
      makeEntry({ id: 'e3', armband: '300' }),
      makeEntry({ id: 'e1', armband: '100' }),
      makeEntry({ id: 'e2', armband: '200' }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('filters out scored entries', () => {
    const entries = [
      makeEntry({ id: 'e1', armband: '100', scored: false }),
      makeEntry({ id: 'e2', armband: '200', scored: true }),
      makeEntry({ id: 'e3', armband: '300', scored: false }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e3']);
  });

  it('handles missing armbands by sorting to front', () => {
    const entries = [
      makeEntry({ id: 'e2', armband: '200' }),
      makeEntry({ id: 'e1', armband: undefined }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('handles string armbands with leading zeros', () => {
    const entries = [
      makeEntry({ id: 'e2', armband: '020' }),
      makeEntry({ id: 'e1', armband: '005' }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns empty array for empty input', () => {
    expect(getRunOrder([])).toEqual([]);
  });

  it('returns all entries when none are scored', () => {
    const entries = [
      makeEntry({ id: 'e1', armband: '100' }),
      makeEntry({ id: 'e2', armband: '200' }),
    ];
    expect(getRunOrder(entries)).toHaveLength(2);
  });

  it('handles empty string armbands by sorting to front', () => {
    const entries = [makeEntry({ id: 'e2', armband: '200' }), makeEntry({ id: 'e1', armband: '' })];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('handles non-numeric armbands by sorting to front', () => {
    const entries = [
      makeEntry({ id: 'e2', armband: '200' }),
      makeEntry({ id: 'e1', armband: 'ABC' }),
    ];
    const result = getRunOrder(entries);
    expect(result.map(e => e.id)).toEqual(['e1', 'e2']);
  });
});
