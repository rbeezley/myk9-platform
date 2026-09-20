import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { useAccountEnteredShowIds } from './useAccountEnteredShowIds';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: useQueryMock };
});

vi.mock('@/services/database/entries', () => ({ getUserEntries: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));

describe('useAccountEnteredShowIds', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    vi.mocked(getUserEntries).mockReset();
    vi.mocked(useAuthContext).mockReturnValue({
      user: { id: 'user-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
    } as ReturnType<typeof useAuthContext>);
  });

  it('does not turn an account-level read into a ready zero while it is loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useAccountEnteredShowIds());

    expect(result.current).toMatchObject({
      all: [],
      active: [],
      isLoading: true,
      isError: false,
      identityState: 'resolved',
      hasUsablePersonId: true,
      readState: 'read-pending',
    });
  });

  it('exposes a failed account-level read instead of presenting an empty entry list', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    const { result } = renderHook(() => useAccountEnteredShowIds());

    expect(result.current).toMatchObject({
      all: [],
      active: [],
      isLoading: false,
      isError: true,
      identityState: 'resolved',
      hasUsablePersonId: true,
      readState: 'error',
    });
  });

  it('throws account-level service errors so React Query can expose the failure state', async () => {
    const readError = new Error('entries unavailable');
    vi.mocked(getUserEntries).mockResolvedValue({
      data: [],
      error: readError,
      source: 'replica-after-error',
    });
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderHook(() => useAccountEnteredShowIds());

    const queryConfig = useQueryMock.mock.calls[0]?.[0] as
      { queryFn?: () => Promise<unknown> } | undefined;
    await expect(queryConfig?.queryFn?.()).rejects.toBe(readError);
  });

  it('keeps the query idle for a visitor without a person id', () => {
    vi.mocked(useAuthContext).mockReturnValue({
      personId: null,
      personIdentityState: 'unresolved',
      hasUsablePersonId: false,
    } as ReturnType<typeof useAuthContext>);
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: true });

    const { result } = renderHook(() => useAccountEnteredShowIds());

    expect(result.current).toMatchObject({
      all: [],
      active: [],
      isLoading: false,
      isError: false,
      identityState: 'unresolved',
      hasUsablePersonId: false,
      readState: 'identity-unresolved',
    });
  });
});
