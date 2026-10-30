import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';

const state = vi.hoisted(() => ({ roles: new Set<string>(), grant: null as string | null }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: (role: string) => state.roles.has(role) }),
}));
vi.mock('./useRingsideGrantRole', () => ({ useRingsideGrantRole: () => state.grant }));

import { AtShowDogsLink } from './AtShowDogsLink';

beforeEach(() => {
  state.roles = new Set();
  state.grant = null;
});

describe('AtShowDogsLink', () => {
  it.each([UserRole.SECRETARY, UserRole.JUDGE, UserRole.STEWARD, UserRole.CLUB_ADMIN])(
    'offers the dog finder to %s',
    role => {
      state.roles = new Set([role]);
      render(<AtShowDogsLink showId="s1" />);
      expect(screen.getByRole('link', { name: /Find a dog/ })).toHaveAttribute(
        'href',
        '/at-show/s1/dogs'
      );
    }
  );

  it('offers nothing to an exhibitor-only account', () => {
    state.roles = new Set([UserRole.EXHIBITOR]);
    render(<AtShowDogsLink showId="s1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('lets an exhibitor passcode grant override a staff account role', () => {
    state.roles = new Set([UserRole.SECRETARY]);
    state.grant = 'exhibitor';
    render(<AtShowDogsLink showId="s1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
