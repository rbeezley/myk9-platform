import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string; is_anonymous?: boolean } | null,
  rbacLoading: false,
  historyCount: 0,
  state: 'ready' as 'ready' | 'loading' | 'error',
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mocks.user,
    userWithRoles: { databaseUserId: 'db-1' },
    rbacLoading: mocks.rbacLoading,
  }),
}));
vi.mock('@/hooks/guestServerRead', () => ({ isAccountSession: () => true }));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/features/exhibitor-entry/useSubmittedEntryProjection', () => ({
  useSubmittedEntryProjection: () => ({
    projection: { historyCount: mocks.historyCount },
    state: mocks.state,
  }),
}));

import { useShowResultsAccess } from './useShowResultsAccess';

const SHOW_ID = '3f2b1c9e-8d4a-4e6b-9a1c-2b7d5e8f0a11';
const access = (canManage = false) =>
  renderHook(() => useShowResultsAccess(SHOW_ID, canManage)).result.current;

describe('useShowResultsAccess', () => {
  beforeEach(() => {
    mocks.user = { id: 'u1' };
    mocks.rbacLoading = false;
    mocks.historyCount = 0;
    mocks.state = 'ready';
  });

  it('gives an exhibitor with entry history Results even with nothing active today', () => {
    mocks.historyCount = 2;
    expect(access()).toBe(true);
  });

  it('withholds Results from a public viewer with no entry history', () => {
    expect(access()).toBe(false);
  });

  it("withholds Results until the viewer's entries resolve", () => {
    mocks.state = 'loading';
    expect(access()).toBe(false);
  });

  it('gives a show manager Results whatever their entries', () => {
    expect(access(true)).toBe(true);
  });
});
