/**
 * A blocked show delete points at where the show is cancelled. MYK9-922 round 8:
 * it linked /secretary/settings, which club admins cannot open. The link must
 * land on a route and tab every role that can manage the show can use.
 */
import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import { getTabsForUser } from '@/utils/unified-shows-config';
import { blockedActionFor } from './deleteBlockedAction';

const asUser = (role: UserRole): UserWithRoles =>
  ({
    id: 'u1',
    databaseUserId: 'p1',
    email: 'u@example.com',
    roles: [role],
    permissions: [],
    scopes: [],
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
  }) as UserWithRoles;

describe('blocked show delete: Cancel show link', () => {
  const action = blockedActionFor('show', [{ id: 's1', name: 'Heartland Classic' }]);
  const url = new URL(action?.to ?? '/', 'https://app.test');

  it.each([UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])(
    'lands %s on a tab they can open',
    role => {
      const tabs = getTabsForUser(asUser(role)).tabs.map(tab => tab.id);
      expect(tabs).toContain(url.searchParams.get('tab'));
    }
  );

  it('is not the secretary-only settings page', () => {
    expect(url.pathname).not.toBe('/secretary/settings');
    expect(url.pathname).toBe('/shows');
  });
});
