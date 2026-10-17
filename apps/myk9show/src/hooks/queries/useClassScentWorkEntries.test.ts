import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { msToDisplay } from '@/lib/timeUtils';
import type { ScentWorkClassConfig } from '@/types/scent-work-types';
import { useClassScentWorkEntries } from './useClassScentWorkEntries';

const mocks = vi.hoisted(() => ({ local: [] as unknown[] }));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassEntriesWithQuery: () => ({ entries: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/hooks/useFilteredEntries', () => ({ useEntriesByClass: () => mocks.local }));

const classConfig = { timeLimit: 180000 } as unknown as ScentWorkClassConfig;

function searchTimeFor(score: string): number {
  mocks.local = [
    {
      id: 'e1',
      dogId: 'd1',
      registrationData: {},
      competitionData: { score, qualified: true },
    },
  ];
  const { result } = renderHook(() => useClassScentWorkEntries('c1', classConfig));
  return result.current.entries[0]?.judgingState?.currentResult?.searchTime ?? Number.NaN;
}

describe('useClassScentWorkEntries stored search time', () => {
  it.each([
    ['2.01', '0:02.01'],
    ['4.02', '0:04.02'],
    ['61.23', '1:01.23'],
  ])('stored %s s displays as %s through the flooring formatter', (score, expected) => {
    expect(msToDisplay(searchTimeFor(score), 'hundredths')).toBe(expected);
  });

  it('hands integer milliseconds to display consumers', () => {
    expect(Number.isInteger(searchTimeFor('2.01'))).toBe(true);
  });
});

describe('msToDisplay running clocks', () => {
  it('still floors a live clock at 59,996 ms', () => {
    expect(msToDisplay(59996, 'hundredths')).toBe('0:59.99');
  });
});
