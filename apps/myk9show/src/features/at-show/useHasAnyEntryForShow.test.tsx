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
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ personIdentityState: 'resolved', hasUsablePersonId: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

function queryFn() {
  renderHook(() => useHasAnyEntryForShow('show-1'));
  const config = useQueryMock.mock.calls[0]?.[0] as {
    queryFn: () => Promise<{ entered: boolean; confirmed: boolean }>;
  };
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

  it('still answers ENTERED from replica rows when the read SUCCEEDS unconfirmed', async () => {
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [{ show_id: 'show-1' }],
      error: null,
      source: 'replica-offline',
    });

    // Ringside access is not money: an unconfirmed row is still the best
    // evidence the exhibitor is entered, and refusing it would lock them out of
    // the ring for being offline. Only MONEY is withheld on a replica source.
    await expect(queryFn()()).resolves.toEqual({ entered: true, confirmed: true });
  });

  // MYK9-629 round 1. The dangerous asymmetry: a row FOUND in the replica is
  // evidence, a row NOT FOUND in it is not. The per-show snapshot is incomplete
  // by construction for an account-level query, so "no row for this show" from
  // an unconfirmed read is an absence of knowledge — and the gate was spending
  // it as "you are a stranger to this show", to an entered exhibitor at the ring.
  it('reports "could not confirm" when an UNCONFIRMED read finds no row', async () => {
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [{ show_id: 'some-other-show' }],
      error: null,
      source: 'replica-offline',
    });

    await expect(queryFn()()).resolves.toEqual({ entered: false, confirmed: false });
  });

  it('reports a real "not entered" when a CONFIRMED read finds no row', async () => {
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [{ show_id: 'some-other-show' }],
      error: null,
      source: 'confirmed',
    });

    await expect(queryFn()()).resolves.toEqual({ entered: false, confirmed: true });
  });

  it('surfaces the unconfirmed miss to the gate as isError', () => {
    useQueryMock.mockReturnValue({
      data: { entered: false, confirmed: false },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useHasAnyEntryForShow('show-1'));

    expect(result.current.isError).toBe(true);
    expect(result.current.hasAnyEntryForShow).toBe(false);
  });

  it('does not report isError for a confirmed "not entered"', () => {
    useQueryMock.mockReturnValue({
      data: { entered: false, confirmed: true },
      isLoading: false,
      isError: false,
    });
    const { result } = renderHook(() => useHasAnyEntryForShow('show-1'));

    expect(result.current.isError).toBe(false);
  });

  it('reports the failure to the gate rather than swallowing it', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result } = renderHook(() => useHasAnyEntryForShow('show-1'));
    expect(result.current.isError).toBe(true);
    expect(result.current.hasAnyEntryForShow).toBe(false);
  });
});
