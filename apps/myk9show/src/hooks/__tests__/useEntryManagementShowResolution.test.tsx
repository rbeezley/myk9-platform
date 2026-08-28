/**
 * Hook-level tests for show resolution (impeccable p3, confirm-round findings
 * N2 and N3).
 *
 * The page-level test for this area mocks `useEntryManagementData` wholesale,
 * so it can only prove the page renders correctly GIVEN a `showError`. Both
 * regressions below lived entirely in the unmocked half:
 *
 * N2 - `isLoadingShows` goes false as soon as the show LIST settles, but a deep
 * link then falls back to `getShowById`. Gating the page's "no show selected"
 * branch on `isLoadingShows` therefore rendered a confident "No show selected"
 * during that second await, for a show that was about to resolve. `loadShows`
 * swallowing its error produced a blank page; the first fix for it produced a
 * falsehood instead. `didResolveShow` is the gate that is actually true only
 * once resolution has finished.
 *
 * N3 - the deep-link lookup is latched behind `didApplyInitial`, which is
 * already true by the time its error is on screen. So the Retry button, wired
 * to `loadShows`, cleared the error without ever re-attempting the lookup and
 * silently downgraded "couldn't open this show" to "no show selected".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  getSecretaryShows: vi.fn(),
  getShowById: vi.fn(),
  getEntriesForShow: vi.fn(),
}));

vi.mock('@/services/database/shows', () => ({
  getSecretaryShows: mocks.getSecretaryShows,
  getShowById: mocks.getShowById,
}));

vi.mock('@/services/database/entries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/entries')>();
  return { ...actual, getEntriesForShow: mocks.getEntriesForShow };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'secretary-1' }, hasRole: () => true }),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { entries: 'success' } },
    triggerSync: vi.fn(),
  }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useEntryManagementData } from '../useEntryManagementData';

/** A promise a test can settle by hand, to hold a load open mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.getEntriesForShow.mockResolvedValue({ data: [], error: null });
});

describe('useEntryManagementData — show resolution (N2)', () => {
  it('does not report resolution finished while the deep-link lookup is still running', async () => {
    // The show list settles WITHOUT the deep-linked show in it...
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });
    // ...so the direct lookup runs, and we hold it open.
    const lookup = deferred<{ data: { id: string; name: string } | null; error: null }>();
    mocks.getShowById.mockReturnValue(lookup.promise);

    const { result } = renderHook(() => useEntryManagementData('show-deep'));

    // The list has settled, so `isLoadingShows` is already false here. If the
    // page gated on that, it would now be claiming "no show selected".
    await waitFor(() => expect(result.current.isLoadingShows).toBe(false));
    expect(result.current.selectedShowId).toBe('');
    expect(result.current.didResolveShow).toBe(false);

    await act(async () => {
      lookup.resolve({ data: { id: 'show-deep', name: 'Cascade Cluster' }, error: null });
    });

    await waitFor(() => expect(result.current.didResolveShow).toBe(true));
    expect(result.current.selectedShowId).toBe('show-deep');
    expect(result.current.showError).toBeNull();
  });

  it('surfaces an error when the show list read fails, instead of swallowing it', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: null, error: new Error('403') });
    mocks.getShowById.mockResolvedValue({ data: null, error: new Error('403') });

    const { result } = renderHook(() => useEntryManagementData('show-deep'));

    await waitFor(() => expect(result.current.showError).toBeTruthy());
    expect(result.current.selectedShowId).toBe('');
  });

  it('surfaces an error when a deep-linked show cannot be resolved at all', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });
    mocks.getShowById.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useEntryManagementData('show-missing'));

    await waitFor(() => expect(result.current.didResolveShow).toBe(true));
    expect(result.current.showError).toBeTruthy();
  });
});

describe('useEntryManagementData — retry re-runs the deep link (N3)', () => {
  it('re-attempts the direct show lookup, not just the show list', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });
    mocks.getShowById.mockResolvedValue({ data: null, error: new Error('offline') });

    const { result } = renderHook(() => useEntryManagementData('show-deep'));
    await waitFor(() => expect(result.current.showError).toBeTruthy());
    expect(mocks.getShowById).toHaveBeenCalledTimes(1);

    // The show becomes reachable, and the secretary hits Retry.
    mocks.getShowById.mockResolvedValue({
      data: { id: 'show-deep', name: 'Cascade Cluster' },
      error: null,
    });

    await act(async () => {
      result.current.retryShowResolution();
    });

    await waitFor(() => expect(mocks.getShowById).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.selectedShowId).toBe('show-deep'));
    expect(result.current.showError).toBeNull();
  });

  it('never leaves the page claiming "no show selected" after a failed retry', async () => {
    mocks.getSecretaryShows.mockResolvedValue({ data: [], error: null });
    mocks.getShowById.mockResolvedValue({ data: null, error: new Error('still offline') });

    const { result } = renderHook(() => useEntryManagementData('show-deep'));
    await waitFor(() => expect(result.current.showError).toBeTruthy());

    await act(async () => {
      result.current.retryShowResolution();
    });

    // Still unresolved, so it must still say so -- the failure mode was the
    // error quietly becoming the much weaker "no show selected".
    await waitFor(() => expect(result.current.didResolveShow).toBe(true));
    expect(result.current.showError).toBeTruthy();
  });
});
