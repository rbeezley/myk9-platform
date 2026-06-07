import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { features } from '@/config/features';
import { useRingsideGrantStore, type RingsideGrant } from '@/store/ringsideGrantStore';
import {
  useLocalPresenceIdentity,
  roleLabel,
} from '@/features/show-presence/useLocalPresenceIdentity';

const h = vi.hoisted(() => ({
  getUserRolesSpy: vi.fn(() => ['secretary']),
  auth: { user: null as { id: string; email?: string } | null } as {
    user: { id: string; email?: string } | null;
    firstName?: string;
    getUserRoles?: () => string[];
  },
}));

vi.mock('@/config/features', () => ({ features: { showPresence: true } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => h.auth }));

function setGrant(grant: RingsideGrant | null) {
  useRingsideGrantStore.setState({ activeGrant: grant });
}

beforeEach(() => {
  vi.clearAllMocks();
  (features as { showPresence: boolean }).showPresence = true;
  h.getUserRolesSpy.mockReturnValue(['secretary']);
  h.auth = { user: null };
  setGrant(null);
});

describe('roleLabel', () => {
  it('title-cases a role and falls back to Someone', () => {
    expect(roleLabel('judge')).toBe('Judge');
    expect(roleLabel('steward')).toBe('Steward');
    expect(roleLabel('')).toBe('Someone');
  });
});

describe('useLocalPresenceIdentity', () => {
  it('resolves a signed-in account (account identity wins)', () => {
    h.auth = {
      user: { id: 'u1', email: 'sue@example.com' },
      firstName: 'Sue',
      getUserRoles: h.getUserRolesSpy,
    };
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toEqual({ userId: 'u1', name: 'Sue', role: 'secretary' });
  });

  it('uses the highest-privilege role, not the first listed (regression)', () => {
    // The live bug: getUserRoles()[0] is often 'exhibitor' even for a secretary,
    // so per-show staff were mis-classified and (via the privacy filter) hidden
    // from everyone. getPrimaryRole walks the role hierarchy instead.
    h.getUserRolesSpy.mockReturnValue(['exhibitor', 'secretary']);
    h.auth = {
      user: { id: 'u1', email: 'sue@example.com' },
      firstName: 'Sue',
      getUserRoles: h.getUserRolesSpy,
    };
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current?.role).toBe('secretary');
  });

  it('falls back to the email local-part when there is no first name', () => {
    h.auth = {
      user: { id: 'u1', email: 'sue@example.com' },
      getUserRoles: h.getUserRolesSpy,
    };
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current?.name).toBe('sue');
  });

  it('is a complete no-op when the kill switch is off (never reads getUserRoles)', () => {
    // Regression guard (review P1): dark = null, and it must not touch the
    // presence-only auth field — older auth mocks omit getUserRoles.
    (features as { showPresence: boolean }).showPresence = false;
    h.auth = { user: { id: 'u1' }, firstName: 'Sue', getUserRoles: h.getUserRolesSpy };
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toBeNull();
    expect(h.getUserRolesSpy).not.toHaveBeenCalled();
  });

  it('derives an anonymous identity from a show-scoped passcode grant (typed name)', () => {
    setGrant({
      showId: 's1',
      role: 'judge',
      name: 'Judge Sarah',
      sessionId: 'sess-1',
      source: 'passcode',
    });
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toEqual({ userId: 'sess-1', name: 'Judge Sarah', role: 'judge' });
  });

  it('uses a role label when an anonymous grant carries no name', () => {
    setGrant({ showId: 's1', role: 'steward', sessionId: 'sess-2', source: 'passcode' });
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toEqual({ userId: 'sess-2', name: 'Steward', role: 'steward' });
  });

  it('ignores a grant scoped to a different show (show-scoping)', () => {
    setGrant({ showId: 'other', role: 'judge', sessionId: 'sess-3', source: 'passcode' });
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toBeNull();
  });

  it('returns null for an anonymous visitor with no grant', () => {
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toBeNull();
  });

  it('prefers the show-scoped grant role over the account role for display', () => {
    // A signed-in steward who entered a JUDGE passcode is scoring as a judge —
    // presence should light the judge dot (judgesOnClass filters role==='judge').
    h.auth = {
      user: { id: 'u1', email: 'sam@example.com' },
      firstName: 'Sam',
      getUserRoles: () => ['steward'],
    };
    setGrant({ showId: 's1', role: 'judge', sessionId: 'sess-4', source: 'passcode' });
    const { result } = renderHook(() => useLocalPresenceIdentity('s1'));
    expect(result.current).toEqual({ userId: 'u1', name: 'Sam', role: 'judge' });
  });
});
