/**
 * A blocked show delete points at where the show is cancelled: the Edit show panel,
 * whose Basic Info Status select offers Cancelled (MYK9-1383). MYK9-922 round 8: it
 * once linked /secretary/settings, which club admins cannot open.
 */
import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import { canManageShowSurface } from '@/utils/roleScopes';
import { blockedActionFor } from './deleteBlockedAction';

describe('blocked show delete: Cancel show link', () => {
  const action = blockedActionFor('show', [{ id: 's1', name: 'Heartland Classic' }]);
  const url = new URL(action?.to ?? '/', 'https://app.test');

  it('opens the Edit show panel, where the Status select cancels the show', () => {
    expect(url.pathname).toBe('/shows/s1');
    expect(url.searchParams.get('edit')).toBe('true');
    expect(url.searchParams.get('tab')).toBeNull();
  });

  it('is not the secretary-only settings page', () => {
    expect(url.pathname).not.toBe('/secretary/settings');
  });
});

describe('blocked show delete: already cancelled', () => {
  it('offers no Cancel show link', () => {
    expect(
      blockedActionFor('show', [
        { id: 's1', name: 'Heartland', context: { showId: 's1', showStatus: 'cancelled' } },
      ])
    ).toBeUndefined();
  });
});

describe('blocked show delete: who can open the Edit panel the link targets', () => {
  // The panel opens only for `canManageShowSurface` (what useShowManageScope calls);
  // every role that can reach the delete dialog must pass it for the show's club.
  const clubId = 'club-1';
  const viewer = (role: UserRole) => {
    const userWithRoles = {
      id: 'u1',
      roles: [role],
      scopes: [{ scopeType: 'club', scopeId: clubId, roleId: role }],
    } as unknown as UserWithRoles;
    return {
      isSecretary: role === UserRole.SECRETARY,
      isAdmin: role === UserRole.SITE_ADMIN,
      hasRole: (r: UserRole) => r === role,
      userWithRoles,
      clubId,
    };
  };

  it.each([UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])(
    'lets %s manage the show',
    role => {
      expect(canManageShowSurface(viewer(role))).toBe(true);
    }
  );
});

describe('blocked entry delete: Withdraw / Pull link', () => {
  it('opens the blocked entry in the all-registrations queue', () => {
    const action = blockedActionFor('entry', [
      { id: 'entry-1', name: 'Scout', context: { showId: 'show-1' } },
    ]);

    expect(action?.to).toBe('/shows/show-1/entries?queue=all&entry=entry-1');
  });
});
