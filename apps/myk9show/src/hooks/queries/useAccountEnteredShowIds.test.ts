import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { useAccountEnteredShowIds } from './useAccountEnteredShowIds';
import { getUserEntries } from '@/services/database/entries';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: useQueryMock };
});

vi.mock('@/services/database/entries', () => ({ getUserEntries: vi.fn() }));

describe('useAccountEnteredShowIds', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    vi.mocked(getUserEntries).mockReset();
  });

  it('does not turn an account-level read into a ready zero while it is loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useAccountEnteredShowIds('person-1'));

    expect(result.current).toEqual({ all: [], active: [], isLoading: true, isError: false });
  });

  it('exposes a failed account-level read instead of presenting an empty entry list', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    const { result } = renderHook(() => useAccountEnteredShowIds('person-1'));

    expect(result.current).toEqual({ all: [], active: [], isLoading: false, isError: true });
  });

  it('throws account-level service errors so React Query can expose the failure state', async () => {
    const readError = new Error('entries unavailable');
    vi.mocked(getUserEntries).mockResolvedValue({ data: [], error: readError });
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderHook(() => useAccountEnteredShowIds('person-1'));

    const queryConfig = useQueryMock.mock.calls[0]?.[0] as
      | { queryFn?: () => Promise<unknown> }
      | undefined;
    await expect(queryConfig?.queryFn?.()).rejects.toBe(readError);
  });

  it('keeps the query idle for a visitor without a person id', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: true });

    const { result } = renderHook(() => useAccountEnteredShowIds(undefined));

    expect(result.current).toEqual({ all: [], active: [], isLoading: false, isError: false });
  });
});
