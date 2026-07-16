import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getEntryStatusHistory } from '@/services/database/entries/statusHistory';
import { useEntryStatusHistory } from './useEntryStatusHistory';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/services/database/entries/statusHistory', () => ({
  getEntryStatusHistory: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockGetEntryStatusHistory = vi.mocked(getEntryStatusHistory);

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEntryStatusHistory.mockResolvedValue([]);
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('useEntryStatusHistory', () => {
  it('does not request history for non-staff roles', () => {
    mockUseAuthContext.mockReturnValue({
      userWithRoles: { roles: [UserRole.EXHIBITOR] },
    } as never);

    const { result } = renderHook(() => useEntryStatusHistory('entry-1', true), { wrapper });

    expect(result.current.canViewHistory).toBe(false);
    expect(mockGetEntryStatusHistory).not.toHaveBeenCalled();
  });

  it('loads history only when an authorized staff member opens it', async () => {
    mockUseAuthContext.mockReturnValue({
      userWithRoles: { roles: [UserRole.SECRETARY] },
    } as never);
    mockGetEntryStatusHistory.mockResolvedValue([
      {
        id: 'history-1',
        entryId: 'entry-1',
        previousStatus: 'submitted',
        newStatus: 'confirmed',
        changedBy: 'person-1',
        changedAt: '2026-07-16T12:00:00.000Z',
        reason: null,
        actorName: null,
      },
    ]);

    const { result, rerender } = renderHook(
      ({ enabled }) => useEntryStatusHistory('entry-1', enabled),
      { initialProps: { enabled: false }, wrapper }
    );

    expect(mockGetEntryStatusHistory).not.toHaveBeenCalled();
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mockGetEntryStatusHistory).toHaveBeenCalledWith('entry-1');
  });

  it('refreshes and clears the offline state when the browser reconnects', async () => {
    mockUseAuthContext.mockReturnValue({
      userWithRoles: { roles: [UserRole.SECRETARY] },
    } as never);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    const { result } = renderHook(() => useEntryStatusHistory('entry-1', true), { wrapper });
    expect(result.current.isOffline).toBe(true);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current.isOffline).toBe(false));
    expect(mockGetEntryStatusHistory).toHaveBeenCalledWith('entry-1');
  });
});
