import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Module mocks — the services own anon-safe PostgREST fallback, and the
// reshapers (pickLandingTrials / buildPublicShowClasses / buildPublicTrialStats)
// have their own unit tests. This suite verifies only what the hook itself owns:
// query *enablement gating* (warm vs cold store), per-trial fetch fan-out, arg
// threading into the reshapers, and the throw-don't-swallow error invariant.
// ---------------------------------------------------------------------------

const getTrialsByShowMock = vi.hoisted(() => vi.fn());
const getClassesByTrialIdMock = vi.hoisted(() => vi.fn());
const pickLandingTrialsMock = vi.hoisted(() => vi.fn());
const buildPublicShowClassesMock = vi.hoisted(() => vi.fn());
const buildPublicTrialStatsMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/trials', () => ({ getTrialsByShow: getTrialsByShowMock }));
vi.mock('@/services/database/classes', () => ({ getClassesByTrialId: getClassesByTrialIdMock }));
vi.mock('@/pages/ShowDetailsPage.landingTrials', () => ({
  pickLandingTrials: pickLandingTrialsMock,
}));
vi.mock('@/pages/ShowDetailsPage.publicClasses', () => ({
  buildPublicShowClasses: buildPublicShowClassesMock,
  buildPublicTrialStats: buildPublicTrialStatsMock,
}));

import { useShowLandingData } from './useShowLandingData';
import type { Trial } from '@/components/trials/types/trial.types';

function makeTrial(id: string): Trial {
  return { id, showId: 'show-1', name: `Trial ${id}` } as unknown as Trial;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('useShowLandingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pickLandingTrialsMock.mockReturnValue([]);
    buildPublicShowClassesMock.mockReturnValue([]);
    buildPublicTrialStatsMock.mockReturnValue({});
    getTrialsByShowMock.mockResolvedValue({ data: [], error: null });
    getClassesByTrialIdMock.mockResolvedValue({ data: [], error: null });
  });

  it('does not fetch public trials/classes when the store is warm (associated trials present)', () => {
    const associated = [makeTrial('t1')];
    pickLandingTrialsMock.mockReturnValue(associated);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useShowLandingData('show-1', associated, []), { wrapper });

    // Warm store → both queries disabled → no anon reads.
    expect(getTrialsByShowMock).not.toHaveBeenCalled();
    expect(getClassesByTrialIdMock).not.toHaveBeenCalled();
    // pickLandingTrials runs with the store rows and an undefined public result.
    expect(pickLandingTrialsMock).toHaveBeenCalledWith(associated, undefined);
    expect(result.current.landingTrials).toBe(associated);
  });

  it('does not fetch when showId is missing, even with a cold store', () => {
    const { wrapper } = createWrapper();

    renderHook(() => useShowLandingData(undefined, [], []), { wrapper });

    expect(getTrialsByShowMock).not.toHaveBeenCalled();
    expect(getClassesByTrialIdMock).not.toHaveBeenCalled();
  });

  it('fetches public trials on a cold store but skips classes when no trials resolve', async () => {
    getTrialsByShowMock.mockResolvedValue({ data: [], error: null });
    pickLandingTrialsMock.mockReturnValue([]); // nothing to map → no landing trials

    const { wrapper } = createWrapper();
    renderHook(() => useShowLandingData('show-1', [], []), { wrapper });

    await waitFor(() => expect(getTrialsByShowMock).toHaveBeenCalledWith('show-1'));
    // No landing trials → the classes query stays disabled.
    expect(getClassesByTrialIdMock).not.toHaveBeenCalled();
  });

  it('fans out a class fetch per landing trial and threads the rows into the reshapers', async () => {
    const t1 = makeTrial('t1');
    const t2 = makeTrial('t2');
    pickLandingTrialsMock.mockReturnValue([t1, t2]);
    getTrialsByShowMock.mockResolvedValue({ data: [{ id: 't1' }, { id: 't2' }], error: null });
    getClassesByTrialIdMock.mockImplementation(async (trialId: string) => ({
      data: [{ id: `c-${trialId}` }],
      error: null,
    }));
    const showEntries = [{ id: 'e1', class_id: 'c-t1' }];
    buildPublicShowClassesMock.mockReturnValue([{ id: 'c-t1' }]);
    buildPublicTrialStatsMock.mockReturnValue({
      t1: { classCount: 1, entryCount: 1, completedClasses: 0 },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useShowLandingData('show-1', [], showEntries), { wrapper });

    await waitFor(() => expect(getClassesByTrialIdMock).toHaveBeenCalledTimes(2));
    expect(getClassesByTrialIdMock).toHaveBeenCalledWith('t1');
    expect(getClassesByTrialIdMock).toHaveBeenCalledWith('t2');

    // Reshapers receive the landing trials + the per-trial rows (order preserved) + entries.
    await waitFor(() =>
      expect(buildPublicShowClassesMock).toHaveBeenCalledWith(
        [t1, t2],
        [
          { trialId: 't1', rows: [{ id: 'c-t1' }] },
          { trialId: 't2', rows: [{ id: 'c-t2' }] },
        ],
        showEntries
      )
    );
    expect(buildPublicTrialStatsMock).toHaveBeenCalledWith(
      [
        { trialId: 't1', rows: [{ id: 'c-t1' }] },
        { trialId: 't2', rows: [{ id: 'c-t2' }] },
      ],
      showEntries
    );
    expect(result.current.publicShowClasses).toEqual([{ id: 'c-t1' }]);
    expect(result.current.publicTrialStats).toEqual({
      t1: { classCount: 1, entryCount: 1, completedClasses: 0 },
    });
  });

  it('throws on a class-fetch error instead of swallowing it into a false-empty result', async () => {
    // The service returns { data: [], error } on a fallback failure — NOT a throw.
    // The hook must surface that as a query error (so React Query retries) rather
    // than treating empty rows as success, which would render a permanent empty tab.
    const t1 = makeTrial('t1');
    pickLandingTrialsMock.mockReturnValue([t1]);
    getTrialsByShowMock.mockResolvedValue({ data: [{ id: 't1' }], error: null });
    getClassesByTrialIdMock.mockResolvedValue({ data: [], error: new Error('read failed') });

    const { qc, wrapper } = createWrapper();
    renderHook(() => useShowLandingData('show-1', [], []), { wrapper });

    await waitFor(() => {
      const classesQuery = qc
        .getQueryCache()
        .getAll()
        .find(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'public-show-classes');
      expect(classesQuery?.state.status).toBe('error');
    });
  });
});
