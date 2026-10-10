import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';

const navigate = vi.fn();
const auth = vi.hoisted(() => ({ roles: [] as string[] }));
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: () => auth.roles }),
}));

import { useLeaveRingside, LEAVE_RINGSIDE_LABEL } from './useLeaveRingside';

describe('useLeaveRingside (MYK9-1086)', () => {
  beforeEach(() => {
    navigate.mockReset();
    auth.roles = [];
  });

  it("sends a judge to the judge's dashboard", () => {
    auth.roles = [UserRole.JUDGE];
    const { result } = renderHook(() => useLeaveRingside());
    result.current.leave();
    expect(navigate).toHaveBeenCalledWith('/judge/dashboard');
    expect(result.current.label).toBe(LEAVE_RINGSIDE_LABEL);
  });

  it('sends an exhibitor to their entries', () => {
    auth.roles = [UserRole.EXHIBITOR];
    const { result } = renderHook(() => useLeaveRingside());
    expect(result.current.path).toBe('/exhibitor/entries');
  });

  it('sends a passcode session with no account to the home page', () => {
    const { result } = renderHook(() => useLeaveRingside());
    expect(result.current.path).toBe('/');
  });
});
