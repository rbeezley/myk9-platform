/**
 * MYK9-629 restructure 3 — a failed account read must not answer "no entry".
 *
 * `getUserEntries` returns `{ data: [], error }` when the view failed AND the
 * replica had nothing. Reading that as an empty row set answered "this person
 * has no entry in this show" as if it were a fact, and `AtShowAccessGate` then
 * showed the stranger copy to an entered exhibitor whose network had dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHasAnyEntryForShow } from './useHasAnyEntryForShow';
import { getUserEntries } from '@/services/database/entries';

const useQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', () => ({ useQuery: useQueryMock }));
vi.mock('@/services/database/entries', () => ({ getUserEntries: vi.fn() }));
vi.mock('@/hooks/useEntriesPersonId', () => ({ useEntriesPersonId: () => 'person-1' }));

beforeEach(() => {
  vi.clearAllMocks();
  useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

function queryFn() {
  renderHook(() => useHasAnyEntryForShow('show-1'));
  const config = useQueryMock.mock.calls[0]?.[0] as { queryFn: () => Promise<boolean> };
  return config.queryFn;
}

describe('useHasAnyEntryForShow', () => {
  it('throws a failed read instead of reporting "no entry for this show"', async () => {
    const readError = new Error('entries unavailable');
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [],
      error: readError as never,
      source: 'replica-after-error',
    });

    await expect(queryFn()()).rejects.toBe(readError);
  });

  it('still answers true from replica rows when the read SUCCEEDS unconfirmed', async () => {
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [{ show_id: 'show-1' }],
      error: null,
      source: 'replica-offline',
    });

    // Ringside access is not money: an unconfirmed row is still the best
    // evidence the exhibitor is entered, and refusing it would lock them out of
    // the ring for being offline. Only MONEY is withheld on a replica source.
    await expect(queryFn()()).resolves.toBe(true);
  });

  it('reports the failure to the gate rather than swallowing it', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result } = renderHook(() => useHasAnyEntryForShow('show-1'));
    expect(result.current.isError).toBe(true);
    expect(result.current.hasAnyEntryForShow).toBe(false);
  });
});
