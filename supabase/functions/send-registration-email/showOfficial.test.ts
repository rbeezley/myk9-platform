import { describe, expect, it } from 'vitest';

import { roleManagesShow } from './showOfficial';

const show = { id: 's1', club_id: 'club1' };

describe('roleManagesShow', () => {
  it('lets a site admin, a club secretary, a club admin and a show-scoped secretary through', () => {
    expect(roleManagesShow({ club_id: null, roles: { name: 'site_admin' } }, show)).toBe(true);
    expect(roleManagesShow({ club_id: 'club1', roles: { name: 'trial_secretary' } }, show)).toBe(
      true
    );
    expect(roleManagesShow({ club_id: 'club1', roles: { name: 'club_admin' } }, show)).toBe(true);
    expect(
      roleManagesShow({ club_id: null, show_id: 's1', roles: { name: 'secretary' } }, show)
    ).toBe(true);
  });

  it('refuses another club, another show, and roles that do not manage shows', () => {
    expect(roleManagesShow({ club_id: 'club2', roles: { name: 'trial_secretary' } }, show)).toBe(
      false
    );
    expect(
      roleManagesShow({ club_id: null, show_id: 's2', roles: { name: 'secretary' } }, show)
    ).toBe(false);
    expect(roleManagesShow({ club_id: 'club1', roles: { name: 'exhibitor' } }, show)).toBe(false);
  });
});
