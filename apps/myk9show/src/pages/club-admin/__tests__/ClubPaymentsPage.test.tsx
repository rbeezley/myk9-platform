// Club scope-gating regression (unified-financial-dashboard, MYK9-54, task
// 3.3): a user without a club_admin CLUB scope must see no club financials —
// no ClubPaymentsCard, no reconciliation card, no per-show data.
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ClubPaymentsPage from '../ClubPaymentsPage';
import { ScopeType, UserRole } from '@/types/auth-types';

const h = vi.hoisted(() => ({
  roles: [] as string[],
  userWithRoles: undefined as
    { scopes: Array<{ roleId: string; scopeType: string; scopeId: string }> } | undefined,
  ensureClubsReady: vi.fn(() => Promise.resolve({ status: 'fresh', clubs: [] })),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => h.roles,
    userWithRoles: h.userWithRoles,
  }),
}));

vi.mock('@/store/clubStore', () => {
  const state = {
    clubs: [{ id: 'club-1', name: 'Heartland Club' }],
    clubReadiness: 'fresh',
    ensureClubsReady: h.ensureClubsReady,
  };
  return {
    useClubStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/features/payments/ClubPaymentsCard', () => ({
  ClubPaymentsCard: ({ clubId }: { clubId: string }) => (
    <div data-testid="club-payments-card">{clubId}</div>
  ),
}));

describe('ClubPaymentsPage — club scope-gating', () => {
  it('a non-club-admin (no CLUB scope) sees no club financials', () => {
    h.roles = [UserRole.EXHIBITOR];
    h.userWithRoles = { scopes: [] };
    render(<ClubPaymentsPage />);

    expect(screen.queryByTestId('club-payments-card')).not.toBeInTheDocument();
    // MYK9-138: this previously asserted the CONNECTIVITY message, codifying the
    // bug — an exhibitor is not blocked by their network, they lack the role.
    expect(screen.getByText(/club administrator access/i)).toBeInTheDocument();
    expect(screen.queryByText(/connection/i)).not.toBeInTheDocument();
  });

  it('a secretary scoped to a club (not club_admin) sees no club financials', () => {
    h.roles = [UserRole.SECRETARY];
    h.userWithRoles = {
      scopes: [{ roleId: UserRole.SECRETARY, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    };
    render(<ClubPaymentsPage />);

    expect(screen.queryByTestId('club-payments-card')).not.toBeInTheDocument();
  });

  it('a club admin sees the club payments card scoped to their club', () => {
    h.roles = [UserRole.CLUB_ADMIN];
    h.userWithRoles = {
      scopes: [{ roleId: UserRole.CLUB_ADMIN, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    };
    render(<ClubPaymentsPage />);

    expect(screen.getByTestId('club-payments-card')).toHaveTextContent('club-1');
  });

  // MYK9-229: the club admin is the one who fields "why is there a 7% fee?"
  // and who decides whether the club keeps using myK9Show, so the page must
  // answer it — starting with the club's own money being untouched.
  it('a club admin is told the club receives 100% of entry fees, with a link to the details', () => {
    h.roles = [UserRole.CLUB_ADMIN];
    h.userWithRoles = {
      scopes: [{ roleId: UserRole.CLUB_ADMIN, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    };
    render(<ClubPaymentsPage />);

    expect(screen.getByText(/Your club receives 100% of entry fees\./i)).toBeInTheDocument();
    expect(screen.getByText(/never deducted from your payout/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how our fees work/i })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it('a user without club access sees no fee note either', () => {
    h.roles = [UserRole.EXHIBITOR];
    h.userWithRoles = { scopes: [] };
    render(<ClubPaymentsPage />);

    expect(screen.queryByText(/Your club receives 100% of entry fees/i)).not.toBeInTheDocument();
  });
});
