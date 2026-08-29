/**
 * F27 second pass. The breadcrumb derives `showId` from the class row it reads out of
 * the local replica, and a cold replica returns null WITHOUT throwing. Reporting
 * `showId: undefined` there was the circularity that made the first F27 fix inert:
 * ScoringEntryListPage needs `showId` to sync the trials whose sync would land the
 * class, so with no show id it skipped hydration in precisely the cold-store case.
 *
 * Exercises the real hook, not a stand-in — the mock in ScoringLoadingStates.test.tsx
 * hardcodes `showId: 'show-1'` even when the class is missing, which is what hid this.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn() },
}));
vi.mock('@/services/database/classes/scoringHierarchy', () => ({
  fetchScoringHierarchy: vi.fn(),
}));

import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { fetchScoringHierarchy } from '@/services/database/classes/scoringHierarchy';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useScoringBreadcrumb on a cold replication store', () => {
  it('resolves showId from the server when the class is not replicated yet', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);
    vi.mocked(fetchScoringHierarchy).mockResolvedValue({
      classId: 'class-1',
      className: 'Exterior Excellent',
      trialId: 'trial-1',
      trialLabel: 'Trial 2',
      showId: 'show-1',
      showName: 'Spring Trial',
    });

    const { result } = renderHook(() => useScoringBreadcrumb('class-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // The whole point: a show id exists even though the class is absent locally, so
    // the page can hydrate the scope that contains it.
    expect(result.current.showId).toBe('show-1');
    expect(result.current.trialId).toBe('trial-1');
    expect(result.current.className).toBe('Exterior Excellent');
  });

  it('still reports no show when the class genuinely does not exist', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);
    vi.mocked(fetchScoringHierarchy).mockResolvedValue(null);

    const { result } = renderHook(() => useScoringBreadcrumb('nope'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.showId).toBeUndefined();
    expect(result.current.className).toBeUndefined();
  });

  it('does not hit the server when the replica already has the class', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      id: 'class-1',
      name: 'Interior Novice A',
      trialId: 'trial-1',
    } as never);
    vi.mocked(replicatedTrialsTable.getTrialById).mockResolvedValue({
      id: 'trial-1',
      showId: 'show-1',
      trialNumber: '2',
    } as never);
    vi.mocked(replicatedShowsTable.get).mockResolvedValue({
      id: 'show-1',
      name: 'Spring Trial',
    } as never);

    const { result } = renderHook(() => useScoringBreadcrumb('class-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.showId).toBe('show-1');
    // Offline-first: the warm path must not reach the network.
    expect(fetchScoringHierarchy).not.toHaveBeenCalled();
  });
});
