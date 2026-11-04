import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanSendTargetedShowMessages } from '../useCanSendTargetedShowMessages';

const auth = vi.hoisted(() => ({
  value: { isSecretary: false, isAdmin: false, hasRole: (_role: string) => false },
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth.value }));

describe('useCanSendTargetedShowMessages', () => {
  beforeEach(() => {
    auth.value = { isSecretary: false, isAdmin: false, hasRole: () => false };
  });

  it('is false for a club admin only', () => {
    auth.value = { ...auth.value, hasRole: role => role === 'club_admin' };
    expect(renderHook(() => useCanSendTargetedShowMessages()).result.current).toBe(false);
  });

  it('is true for a secretary, a site admin, or a trial secretary', () => {
    auth.value = { ...auth.value, isSecretary: true };
    expect(renderHook(() => useCanSendTargetedShowMessages()).result.current).toBe(true);
    auth.value = { ...auth.value, isSecretary: false, isAdmin: true };
    expect(renderHook(() => useCanSendTargetedShowMessages()).result.current).toBe(true);
    auth.value = { ...auth.value, isAdmin: false, hasRole: role => role === 'trial_secretary' };
    expect(renderHook(() => useCanSendTargetedShowMessages()).result.current).toBe(true);
  });
});
