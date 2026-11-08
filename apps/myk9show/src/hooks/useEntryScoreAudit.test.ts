import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getEntryScoreAudit } from '@/services/database/entries/scoreAudit';
import { useEntryScoreAudit } from './useEntryScoreAudit';

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/services/database/entries/scoreAudit', () => ({ getEntryScoreAudit: vi.fn() }));

const mockUseAuthContext = vi.mocked(useAuthContext);
const mockGetEntryScoreAudit = vi.mocked(getEntryScoreAudit);

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEntryScoreAudit.mockResolvedValue([]);
});

describe('useEntryScoreAudit', () => {
  it.each([UserRole.JUDGE, UserRole.EXHIBITOR, UserRole.STEWARD])(
    'does not request the audit for %s',
    role => {
      mockUseAuthContext.mockReturnValue({ userWithRoles: { roles: [role] } } as never);

      const { result } = renderHook(() => useEntryScoreAudit('entry-1', true), { wrapper });

      expect(result.current.canViewScoreHistory).toBe(false);
      expect(mockGetEntryScoreAudit).not.toHaveBeenCalled();
    }
  );

  it('waits until the section is opened, then reads for a secretary', async () => {
    mockUseAuthContext.mockReturnValue({
      userWithRoles: { roles: [UserRole.SECRETARY] },
    } as never);

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useEntryScoreAudit('entry-1', open),
      { wrapper, initialProps: { open: false } }
    );
    expect(mockGetEntryScoreAudit).not.toHaveBeenCalled();

    rerender({ open: true });

    await waitFor(() => expect(mockGetEntryScoreAudit).toHaveBeenCalledWith('entry-1'));
    expect(result.current.canViewScoreHistory).toBe(true);
  });
});
