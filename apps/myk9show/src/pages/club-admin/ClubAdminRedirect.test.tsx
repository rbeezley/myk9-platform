import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import type { ValidatedClubContext } from '@/hooks/useValidatedClubContext';
import { ClubAdminRedirect } from './ClubAdminRedirect';

const validated = vi.hoisted(() => ({ value: { status: 'loading' } as ValidatedClubContext }));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useValidatedClubContext', () => ({
  useCurrentValidatedClubContext: () => validated.value,
}));
vi.mock('@/store/clubStore', () => {
  const state = { ensureClubsReady: vi.fn(() => Promise.resolve()), selectClub: vi.fn() };
  return { useClubStore: (selector: (value: typeof state) => unknown) => selector(state) };
});

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function renderAt(route: string) {
  return render(
    <Routes>
      <Route path="/club-admin/members" element={<ClubAdminRedirect />} />
      <Route path="/club-admin/payments" element={<ClubAdminRedirect />} />
      <Route path="/clubs/:id" element={<Where />} />
    </Routes>,
    { initialRoute: route }
  );
}

describe('ClubAdminRedirect (MYK9-1293)', () => {
  beforeEach(() => {
    validated.value = { status: 'ready', clubId: 'club-1', clubName: 'Heartland', clubs: [] };
  });

  it('sends /club-admin/members to the Members tab of the club page', async () => {
    renderAt('/club-admin/members');
    expect(await screen.findByTestId('where')).toHaveTextContent('/clubs/club-1?tab=members');
  });

  it('keeps Stripe Connect return params when sending payments to the Payments tab', async () => {
    renderAt('/club-admin/payments?connect=return&x=1');
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/clubs/club-1?connect=return&x=1&tab=payments'
    );
  });

  it('keeps the roster search params on the members redirect', async () => {
    renderAt('/club-admin/members?q=ann&status=active');
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/clubs/club-1?q=ann&status=active&tab=members'
    );
  });

  it('shows the club gate, and does not redirect, while the club is unresolved', () => {
    validated.value = { status: 'unavailable' };
    renderAt('/club-admin/payments');
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });
});
