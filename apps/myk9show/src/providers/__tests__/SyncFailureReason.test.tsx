import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContext';
import type { AuthContextType } from '@/context/authContextTypes';
import { UserRole } from '@/types/auth-types';
import { SyncFailureReason } from '../SyncFailureReason';

const REASON = 'Reason: invalid input syntax for type date';
const PERMISSION = "You don't have permission to change this entry.";

function renderWithRoles(roles: UserRole[] | null, reason: string) {
  if (roles === null) return render(<SyncFailureReason reason={reason} />);
  const value = { getUserRoles: () => roles } as unknown as AuthContextType;
  return render(
    <AuthContext.Provider value={value}>
      <SyncFailureReason reason={reason} />
    </AuthContext.Provider>
  );
}

describe('SyncFailureReason (MYK9-1849)', () => {
  it('hides the Reason line from an exhibitor-only account', () => {
    renderWithRoles([UserRole.EXHIBITOR], REASON);
    expect(screen.queryByText(REASON)).toBeNull();
  });

  it('shows the Reason line to staff, including a staff member who is also an exhibitor', () => {
    renderWithRoles([UserRole.SECRETARY], REASON);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    renderWithRoles([UserRole.EXHIBITOR, UserRole.CLUB_ADMIN], REASON);
    expect(screen.getAllByText(REASON)).toHaveLength(2);
  });

  it.each([UserRole.STEWARD, UserRole.CHAIRMAN])(
    'shows the Reason line to an exhibitor who also holds the %s role',
    role => {
      renderWithRoles([UserRole.EXHIBITOR, role], REASON);
      expect(screen.getByText(REASON)).toBeInTheDocument();
    }
  );

  it('shows the Reason line while roles are not known yet, or outside an auth tree', () => {
    renderWithRoles([], REASON);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    renderWithRoles(null, REASON);
    expect(screen.getAllByText(REASON)).toHaveLength(2);
  });

  it('keeps the plain permission sentence for exhibitors', () => {
    renderWithRoles([UserRole.EXHIBITOR], PERMISSION);
    expect(screen.getByText(PERMISSION)).toBeInTheDocument();
  });
});
