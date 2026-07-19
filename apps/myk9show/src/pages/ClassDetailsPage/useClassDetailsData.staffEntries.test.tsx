import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useClassStoreCompat: vi.fn(),
  useClassEntriesWithQuery: vi.fn(),
  useClassEntriesRaw: vi.fn(),
  usePublicClassById: vi.fn(),
  useTrialStore: vi.fn(),
  useShowStore: vi.fn(),
  useDogStoreCompat: vi.fn(),
  useEntriesByClass: vi.fn(),
  useAuthContext: vi.fn(),
  useSecretaryShowEntriesQuery: vi.fn(),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: mocks.useClassStoreCompat,
  useClassEntriesWithQuery: mocks.useClassEntriesWithQuery,
}));
vi.mock('@/hooks/queries/useClassEntriesRaw', () => ({
  useClassEntriesRaw: mocks.useClassEntriesRaw,
}));
vi.mock('@/hooks/queries/usePublicClassById', () => ({
  usePublicClassById: mocks.usePublicClassById,
}));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mocks.useTrialStore }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mocks.useDogStoreCompat }));
vi.mock('@/hooks/useFilteredEntries', () => ({ useEntriesByClass: mocks.useEntriesByClass }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: mocks.useSecretaryShowEntriesQuery,
}));

import { useClassDetailsData } from './useClassDetailsData';

const currentClass = {
  id: 'class-1',
  trialId: 'trial-1',
  className: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  status: 'In Progress',
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/shows/show-1/trials/trial-1/classes/class-1']}>
      <Routes>
        <Route path="/shows/:showId/trials/:trialId/classes/:classId" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useClassDetailsData staff entry source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuthContext.mockReturnValue({ isSecretary: true, isAdmin: false });
    mocks.useClassStoreCompat.mockReturnValue({
      classes: [currentClass],
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
    });
    mocks.useClassEntriesWithQuery.mockReturnValue({ entries: [], isLoading: false, error: null });
    mocks.useClassEntriesRaw.mockReturnValue({ data: [], isLoading: false, error: null });
    mocks.usePublicClassById.mockReturnValue({ data: null });
    mocks.useTrialStore.mockReturnValue({
      trials: [{ id: 'trial-1', showId: 'show-1' }],
      trialClasses: { 'trial-1': [currentClass] },
    });
    mocks.useShowStore.mockReturnValue({ shows: [{ id: 'show-1', name: 'Heartland' }] });
    mocks.useDogStoreCompat.mockReturnValue({ dogs: [] });
    mocks.useEntriesByClass.mockReturnValue([]);
    mocks.useSecretaryShowEntriesQuery.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `entry-${index + 1}`,
        show_id: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        dog_id: `dog-${index + 1}`,
        registration_id: null,
        entry_status: 'accepted',
        payment_status: 'paid_online',
        check_in_status: index < 4 ? 'checked-in' : 'no-status',
        is_scored: index < 3,
        run_order: index + 1,
        armband: String(101 + index),
        handler: `Handler ${index + 1}`,
        dog: {
          id: `dog-${index + 1}`,
          name: `Dog ${index + 1}`,
          call_name: `Dog ${index + 1}`,
          breed: 'Beagle',
          owner: null,
        },
      })),
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('uses the shared show-scoped rows for the staff readiness and run sheet', () => {
    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.dbRawEntries).toHaveLength(8);
    expect(result.current.dbRawEntries.filter(entry => entry.is_scored)).toHaveLength(3);
    expect(result.current.entriesLoading).toBe(false);
    expect(result.current.entriesError).toBeNull();
  });

  it('reports unavailable staff entry data instead of treating a failed load as zero', () => {
    mocks.useSecretaryShowEntriesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('Offline with no cached entries'),
    });

    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.dbRawEntries).toEqual([]);
    expect(result.current.entriesError).toBe('Offline with no cached entries');
    expect(result.current.entriesLoading).toBe(false);
  });
});
