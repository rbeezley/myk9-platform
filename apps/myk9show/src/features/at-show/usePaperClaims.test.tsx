/**
 * MYK9-1970: the one paper reader. Shows and classes only (never entries), answered through
 * `resolveClaim`, and silent (`unknown`) until the rows have loaded.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePaperClaims } from './usePaperClaims';

const mocks = vi.hoisted(() => ({
  getShowById: vi.fn(),
  getTrialsByShow: vi.fn(),
  getClassesByTrial: vi.fn(),
  getEntriesByShow: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: mocks.getShowById, subscribe: mocks.subscribe },
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
  replicatedClassesTable: {
    getClassesByTrial: mocks.getClassesByTrial,
    subscribe: mocks.subscribe,
  },
  replicatedEntriesTable: { getEntriesByShow: mocks.getEntriesByShow },
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );

function seed(usesDeviceScoring: boolean, flags: Record<string, boolean | null>) {
  mocks.getShowById.mockResolvedValue({ id: 's1', usesDeviceScoring });
  mocks.getTrialsByShow.mockResolvedValue([{ id: 't1' }]);
  mocks.getClassesByTrial.mockResolvedValue(
    Object.entries(flags).map(([id, scoresOnPaper]) => ({ id, scoresOnPaper }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePaperClaims (MYK9-1970)', () => {
  it('claims nothing while the rows are loading', () => {
    mocks.getShowById.mockReturnValue(new Promise(() => {}));
    mocks.getTrialsByShow.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePaperClaims(['s1']), { wrapper });
    expect(result.current.claimOf('c1')).toBe('unknown');
    expect(result.current.paperClassIds.size).toBe(0);
    // An explicit class flag is data on the row itself, so it needs no read.
    expect(result.current.claimOf('c1', false)).toBe('not-paper');
  });

  it('answers paper for a flagged class and for a class that follows a paper show', async () => {
    seed(false, { flagged: true, follows: null, phone: false });
    const { result } = renderHook(() => usePaperClaims(['s1']), { wrapper });
    await waitFor(() => expect(result.current.claimOf('flagged')).toBe('paper'));
    expect(result.current.claimOf('follows')).toBe('paper');
    expect(result.current.claimOf('phone')).toBe('not-paper');
    expect([...result.current.paperClassIds].sort()).toEqual(['flagged', 'follows']);
  });

  it('answers not-paper for a class that follows a device-scored show', async () => {
    seed(true, { follows: null });
    const { result } = renderHook(() => usePaperClaims(['s1']), { wrapper });
    await waitFor(() => expect(result.current.claimOf('follows')).toBe('not-paper'));
  });

  it('never reads entries, and keeps its identity while the answers hold', async () => {
    seed(false, { c1: null });
    const { result, rerender } = renderHook(() => usePaperClaims(['s1']), { wrapper });
    await waitFor(() => expect(result.current.claimOf('c1')).toBe('paper'));
    const { claimOf, paperClassIds } = result.current;
    rerender();
    expect(result.current.claimOf).toBe(claimOf);
    expect(result.current.paperClassIds).toBe(paperClassIds);
    expect(mocks.getEntriesByShow).not.toHaveBeenCalled();
  });

  it('leaves a class that follows the show unknown when the show is not on the device', async () => {
    mocks.getShowById.mockResolvedValue(null);
    mocks.getTrialsByShow.mockResolvedValue([{ id: 't1' }]);
    mocks.getClassesByTrial.mockResolvedValue([{ id: 'c1', scoresOnPaper: null }]);
    const { result } = renderHook(() => usePaperClaims(['s1']), { wrapper });
    await waitFor(() => expect(mocks.getClassesByTrial).toHaveBeenCalled());
    expect(result.current.claimOf('c1')).toBe('unknown');
  });
});
