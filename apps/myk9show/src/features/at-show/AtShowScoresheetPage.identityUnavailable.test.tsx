/**
 * MYK9-1675: an online signed-in judge whose person lookup finished without an
 * id must get Retry + Entries, not the skeleton forever.
 */

import { cloneElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AtShowScoresheetPage } from './AtShowScoresheetPage';

const { identity, retryIdentity } = vi.hoisted(() => ({
  retryIdentity: vi.fn(),
  identity: {
    state: 'missing' as 'unresolved' | 'resolved' | 'missing',
    fetching: false,
    failed: false,
  },
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  return {
    ...actual,
    useAuthContext: () => ({
      getUserRoles: () => [UserRole.JUDGE],
      userWithRoles: { databaseUserId: undefined },
      personId: null,
      user: { is_anonymous: false },
      personIdentityState: identity.state,
      personIdentityLookup: {
        fetching: identity.fetching,
        failed: identity.failed,
        retry: retryIdentity,
      },
    }),
  };
});
vi.mock('./useRingsideEffectiveRole', () => ({
  useRingsideEffectiveRole: () => ({ hasPermission: () => true, showRole: UserRole.JUDGE }),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { clearCachedHideCounts: vi.fn() },
  replicatedJudgeAssignmentsTable: { getAllOrThrow: vi.fn(), sync: vi.fn() },
}));

const page = (
  <Routes>
    <Route
      path="/at-show/:showId/class/:classId/entry/:entryId"
      element={<AtShowScoresheetPage />}
    />
    <Route path="*" element={<div>entry list</div>} />
  </Routes>
);
const renderPage = () =>
  render(page, { initialRoute: '/at-show/show-1/class/class-1/entry/entry-1' });

describe('AtShowScoresheetPage: judge identity that cannot resolve', () => {
  beforeEach(() => {
    identity.state = 'missing';
    identity.fetching = false;
    identity.failed = false;
    retryIdentity.mockReset();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  it('shows Retry and Entries instead of the skeleton when no person row exists', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText(/couldn.t confirm your account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entries/i })).toBeInTheDocument();
  });

  it('shows the same recovery screen when the lookup failed', () => {
    identity.state = 'unresolved';
    identity.failed = true;
    renderPage();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Retry re-runs the identity lookup, and the page waits while it is in flight', () => {
    const { rerender } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryIdentity).toHaveBeenCalledTimes(1);

    identity.fetching = true;
    rerender(cloneElement(page));
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps the skeleton (no recovery screen) while the first lookup is still pending', () => {
    identity.state = 'unresolved';
    renderPage();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
