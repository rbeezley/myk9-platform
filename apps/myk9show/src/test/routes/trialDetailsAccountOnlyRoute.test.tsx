/**
 * MYK9-789: Trial Details (`/trials/:trialId` and `/shows/:showId/trials/:trialId`)
 * is an account-only page. A ringside passcode session (an anonymous auth user)
 * is not an account, so the route sends it to sign-in exactly like a signed-out
 * guest, and the page's data hook, which reads the trial and show stores (the
 * device replica), never mounts for it. A signed-in account keeps the replica
 * path.
 *
 * This renders the production PublicRoutes tree through the real
 * ProtectedRoute; only the page body is replaced, by a probe that runs the real
 * useTrialDetailData against spied stores.
 */
import { render, screen } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/context/AuthContext';
import type { AuthContextType } from '@/context/authContextTypes';
import { PublicRoutes } from '@/routes/publicRoutes';

const spies = vi.hoisted(() => ({
  trialStoreRead: vi.fn(),
  showStoreRead: vi.fn(),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => {
    spies.trialStoreRead();
    return { trials: [{ id: 'trial-1', showId: 'show-1' }], selectedTrialId: null };
  },
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => {
    spies.showStoreRead();
    return { shows: [{ id: 'show-1', clubId: 'club-1' }] };
  },
}));

vi.mock('@/hooks/queries/useTrialsDatabase', () => ({
  useTrialQuery: () => ({ data: undefined, isSuccess: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: undefined }),
  useShowsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/components/common/PageTransition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/TrialDetailsPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const { useTrialDetailData } = await vi.importActual<typeof import('@/hooks/useTrialDetailData')>(
    '@/hooks/useTrialDetailData'
  );
  return {
    default: function TrialDetailsProbe() {
      const { trialId } = router.useParams<{ trialId: string }>();
      const { currentTrial, parentShow } = useTrialDetailData(trialId);
      return (
        <div data-testid="trial-details">
          {currentTrial?.id}:{parentShow?.id}
        </div>
      );
    },
  };
});

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

type SessionUser = { id: string; is_anonymous?: boolean } | null;

function renderTrialRoute(path: string, user: SessionUser) {
  const auth = {
    user,
    loading: false,
    hasRole: () => true,
    hasPermission: () => true,
  } as unknown as AuthContextType;
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={null}>
          <Routes>{PublicRoutes()}</Routes>
        </Suspense>
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const TRIAL_PATHS = ['/trials/trial-1', '/shows/show-1/trials/trial-1'] as const;

describe('Trial Details is account-only (MYK9-789)', () => {
  beforeEach(() => {
    spies.trialStoreRead.mockClear();
    spies.showStoreRead.mockClear();
  });

  it.each(TRIAL_PATHS)(
    'sends a ringside passcode session on %s to sign-in without reading the trial or show store',
    async path => {
      renderTrialRoute(path, { id: 'anon-1', is_anonymous: true });

      expect(await screen.findByTestId('location')).toHaveTextContent(
        `/sign-in?redirectTo=${encodeURIComponent(path)}`
      );
      expect(screen.queryByTestId('trial-details')).not.toBeInTheDocument();
      expect(spies.trialStoreRead).not.toHaveBeenCalled();
      expect(spies.showStoreRead).not.toHaveBeenCalled();
    }
  );

  it.each(TRIAL_PATHS)('still reads the replica for a signed-in account on %s', async path => {
    renderTrialRoute(path, { id: 'user-1', is_anonymous: false });

    expect(await screen.findByTestId('trial-details')).toHaveTextContent('trial-1:show-1');
    expect(spies.trialStoreRead).toHaveBeenCalled();
    expect(spies.showStoreRead).toHaveBeenCalled();
  });

  it.each(TRIAL_PATHS)('still sends a signed-out guest on %s to sign-in', async path => {
    renderTrialRoute(path, null);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/sign-in?redirectTo=${encodeURIComponent(path)}`
    );
    expect(spies.trialStoreRead).not.toHaveBeenCalled();
    expect(spies.showStoreRead).not.toHaveBeenCalled();
  });
});
