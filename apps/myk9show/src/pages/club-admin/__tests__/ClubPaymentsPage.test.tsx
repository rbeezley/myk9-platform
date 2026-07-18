// Club scope-gating regression (unified-financial-dashboard, MYK9-54, task
// 3.3): a user without a club_admin CLUB scope must see no club financials —
// no ClubPaymentsCard, no reconciliation card, no per-show data.
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ClubPaymentsPage from '../ClubPaymentsPage';
import { ScopeType, UserRole } from '@/types/auth-types';

const h = vi.hoisted(() => ({
  userWithRoles: undefined as
    { scopes: Array<{ roleId: string; scopeType: string; scopeId: string }> } | undefined,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: h.userWithRoles }),
}));

vi.mock('@/features/payments/ClubPaymentsCard', () => ({
  ClubPaymentsCard: ({ clubId }: { clubId: string }) => (
    <div data-testid="club-payments-card">{clubId}</div>
  ),
}));

describe('ClubPaymentsPage — club scope-gating', () => {
  it('a non-club-admin (no CLUB scope) sees no club financials', () => {
    h.userWithRoles = { scopes: [] };
    render(<ClubPaymentsPage />);

    expect(screen.queryByTestId('club-payments-card')).not.toBeInTheDocument();
    expect(screen.getByText(/no club is linked to your account yet/i)).toBeInTheDocument();
  });

  it('a secretary scoped to a club (not club_admin) sees no club financials', () => {
    h.userWithRoles = {
      scopes: [{ roleId: UserRole.SECRETARY, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    };
    render(<ClubPaymentsPage />);

    expect(screen.queryByTestId('club-payments-card')).not.toBeInTheDocument();
  });

  it('a club admin sees the club payments card scoped to their club', () => {
    h.userWithRoles = {
      scopes: [{ roleId: UserRole.CLUB_ADMIN, scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    };
    render(<ClubPaymentsPage />);

    expect(screen.getByTestId('club-payments-card')).toHaveTextContent('club-1');
  });
});
