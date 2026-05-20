import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { ScentWorkClassConfig } from '@/types/scent-work-types';

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassEntriesWithQuery: vi.fn(),
}));

vi.mock('@/hooks/useFilteredEntries', () => ({
  useEntriesByClass: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

import { useClassEntriesWithQuery } from '@/hooks/useClassStoreCompat';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassScentWorkEntries } from '../useClassScentWorkEntries';

const mockUseClassEntriesWithQuery = vi.mocked(useClassEntriesWithQuery);
const mockUseEntriesByClass = vi.mocked(useEntriesByClass);
const mockUseDogStoreCompat = vi.mocked(useDogStoreCompat);

const CLASS_ID = 'class-123';

const classConfig: ScentWorkClassConfig = {
  element: 'Interior',
  level: 'Novice',
  timeLimit: 180000,
  multiArea: false,
  warningsEnabled: true,
};

function setMocks(opts: {
  dbEntries?: unknown[];
  localEntries?: unknown[];
  dogs?: unknown[];
  isLoading?: boolean;
  error?: string | null;
}) {
  mockUseClassEntriesWithQuery.mockReturnValue({
    entries: (opts.dbEntries ?? []) as never,
    isLoading: opts.isLoading ?? false,
    error: opts.error ?? null,
    refetch: vi.fn(),
    isStale: false,
  } as never);
  mockUseEntriesByClass.mockReturnValue((opts.localEntries ?? []) as never);
  mockUseDogStoreCompat.mockReturnValue({
    dogs: (opts.dogs ?? []) as never,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClassScentWorkEntries', () => {
  it('returns empty entries when classId is not provided', () => {
    setMocks({ dbEntries: [{ id: 'db-1' }], localEntries: [{ id: 'local-1' }] });
    const { result } = renderHook(() => useClassScentWorkEntries(undefined, classConfig));
    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('transforms local-only entries into ScentWorkEntry with displayInfo from dogsById', () => {
    setMocks({
      localEntries: [
        {
          id: 'local-1',
          showId: 'show-1',
          classId: CLASS_ID,
          dogId: 'dog-1',
          status: 'submitted',
          statusHistory: [],
          registrationData: {
            armband: '42',
            handler: 'Alice',
            handlerId: 'handler-1',
            submittedAt: new Date(),
            entryFee: 25,
            paymentStatus: 'paid',
          },
        },
      ],
      dogs: [
        {
          id: 'dog-1',
          callName: 'Rex',
          name: 'Rex Formal',
          registrations: [{ breed: 'Border Collie' }],
        },
      ],
    });

    const { result } = renderHook(() => useClassScentWorkEntries(CLASS_ID, classConfig));
    expect(result.current.entries).toHaveLength(1);
    const entry = result.current.entries[0]!;
    expect(entry.id).toBe('local-1');
    expect(entry.displayInfo).toEqual({
      armband: '42',
      dogName: 'Rex',
      dogBreed: 'Border Collie',
      handlerName: 'Alice',
      dogId: 'dog-1',
      handlerId: 'handler-1',
    });
    expect(entry.classConfig).toBe(classConfig);
    expect(entry.judgingState?.currentResult).toBeUndefined();
    expect(result.current.localCount).toBe(1);
    expect(result.current.dbCount).toBe(0);
  });

  it('transforms DB-only entries into ScentWorkEntry stubs', () => {
    setMocks({
      dbEntries: [
        {
          id: 'db-1',
          classId: CLASS_ID,
          armband: '7',
          handler: 'Bob',
          dog: 'Buddy',
          score: '45.5',
          time: '00:45.50',
          placement: '1',
          status: 'Qualified',
        },
      ],
    });

    const { result } = renderHook(() => useClassScentWorkEntries(CLASS_ID, classConfig));
    expect(result.current.entries).toHaveLength(1);
    const entry = result.current.entries[0]!;
    expect(entry.id).toBe('db-1');
    expect(entry.displayInfo).toEqual({
      armband: '7',
      dogName: 'Buddy',
      dogBreed: 'Unknown Breed',
      handlerName: 'Bob',
      dogId: '',
      handlerId: '',
    });
    expect(entry.competitionData?.qualified).toBe(true);
    expect(entry.competitionData?.placement).toBe('1');
    expect(result.current.localCount).toBe(0);
    expect(result.current.dbCount).toBe(1);
  });

  it('dedupes by id, prefers local, and appends DB-only entries after local entries', () => {
    setMocks({
      localEntries: [
        {
          id: 'shared-1',
          showId: 'show-1',
          classId: CLASS_ID,
          dogId: 'dog-1',
          status: 'submitted',
          statusHistory: [],
          registrationData: {
            armband: '10',
            handler: 'LocalHandler',
            submittedAt: new Date(),
            entryFee: 0,
            paymentStatus: 'pending',
          },
        },
      ],
      dbEntries: [
        {
          id: 'shared-1',
          classId: CLASS_ID,
          armband: '999',
          handler: 'DbHandler',
          dog: 'DbDog',
          status: 'Qualified',
        },
        {
          id: 'db-only',
          classId: CLASS_ID,
          armband: '11',
          handler: 'OnlyDb',
          dog: 'OnlyDog',
          status: 'Not Qualified',
        },
      ],
      dogs: [{ id: 'dog-1', callName: 'Rex' }],
    });

    const { result } = renderHook(() => useClassScentWorkEntries(CLASS_ID, classConfig));
    const entries = result.current.entries;
    expect(entries.map(e => e.id)).toEqual(['shared-1', 'db-only']);
    // Local entry should win for the duplicate id — handler comes from local registrationData
    expect(entries[0]!.displayInfo.handlerName).toBe('LocalHandler');
    expect(entries[1]!.displayInfo.handlerName).toBe('OnlyDb');
  });

  it('populates currentResult with parsed numeric searchTime when competitionData.score is set', () => {
    setMocks({
      localEntries: [
        {
          id: 'local-1',
          showId: 'show-1',
          classId: CLASS_ID,
          dogId: 'dog-1',
          status: 'completed',
          statusHistory: [],
          registrationData: {
            armband: '42',
            handler: 'Alice',
            submittedAt: new Date(),
            entryFee: 0,
            paymentStatus: 'paid',
          },
          competitionData: {
            score: '32.75',
            qualified: true,
            recordedBy: 'Judge',
            recordedAt: new Date('2026-01-15T10:00:00Z').toISOString(),
          },
        },
      ],
      dogs: [{ id: 'dog-1', callName: 'Rex' }],
    });

    const { result } = renderHook(() => useClassScentWorkEntries(CLASS_ID, classConfig));
    const currentResult = result.current.entries[0]!.judgingState?.currentResult;
    expect(currentResult).toBeDefined();
    // 32.75 seconds → 32750 ms
    expect(currentResult?.searchTime).toBe(32750);
    expect(currentResult?.qualification).toBe('Qualified');
    expect(currentResult?.recordedBy).toBe('Judge');
  });

  it('marks currentResult as Not Qualified when competitionData.qualified is false', () => {
    setMocks({
      localEntries: [
        {
          id: 'local-nq',
          showId: 'show-1',
          classId: CLASS_ID,
          dogId: 'dog-1',
          status: 'completed',
          statusHistory: [],
          registrationData: {
            armband: '5',
            handler: 'Carol',
            submittedAt: new Date(),
            entryFee: 0,
            paymentStatus: 'paid',
          },
          competitionData: {
            score: '60.0',
            qualified: false,
            recordedBy: 'Judge',
            recordedAt: new Date().toISOString(),
          },
        },
      ],
      dogs: [{ id: 'dog-1', callName: 'Rex' }],
    });

    const { result } = renderHook(() => useClassScentWorkEntries(CLASS_ID, classConfig));
    expect(result.current.entries[0]!.judgingState?.currentResult?.qualification).toBe(
      'Not Qualified'
    );
  });
});
