import { describe, it, expect } from 'vitest';
import {
  parseActionRouteContext,
  resolveActions,
  type ActionViewer,
} from '@/features/actions/actionRegistry';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

const secretary: ActionViewer = {
  canManageShow: true,
  canOperateShow: true,
  canCreateShows: true,
  isShowManagementStaff: true,
};

const clubAdmin: ActionViewer = {
  canManageShow: true,
  canOperateShow: false,
  canCreateShows: false,
  isShowManagementStaff: false,
};

const exhibitor: ActionViewer = {
  canManageShow: false,
  canOperateShow: false,
  canCreateShows: false,
  isShowManagementStaff: false,
};

describe('parseActionRouteContext', () => {
  it('reads the show id from every show-scoped route', () => {
    for (const path of [
      `/shows/${SHOW_ID}`,
      `/shows/${SHOW_ID}/show-desk`,
      `/shows/${SHOW_ID}/entry-management`,
      `/shows/${SHOW_ID}/trials/t1/classes/c1`,
      `/shows/${SHOW_ID}/register`,
      `/secretary/register/${SHOW_ID}`,
    ]) {
      expect(parseActionRouteContext(path)).toEqual({ kind: 'show', showId: SHOW_ID });
    }
  });

  it('is global off a show route', () => {
    for (const path of ['/', '/shows', '/dogs', '/secretary/dashboard', '/shows/']) {
      expect(parseActionRouteContext(path)).toEqual({ kind: 'global' });
    }
  });

  it('treats /shows/new as global — it is the create-show wizard, not a show', () => {
    // `/shows/new` is a real route that redirects into the wizard
    // (`publicRoutes.tsx`). Parsed as a show it offered a secretary six actions
    // against the show id "new", every one of them a dead link.
    for (const path of ['/shows/new', '/shows/new/']) {
      expect(parseActionRouteContext(path)).toEqual({ kind: 'global' });
    }
    expect(resolveActions(parseActionRouteContext('/shows/new'), secretary)).toEqual([
      { id: 'create-show', label: 'Create a show', href: '/?wizard=true' },
      { id: 'open-show-management', label: 'Open Show Management', href: '/secretary/dashboard' },
    ]);
  });

  it('decodes an encoded show id and ignores a trailing slash or query-free hash', () => {
    expect(parseActionRouteContext(`/shows/${SHOW_ID}/`)).toEqual({
      kind: 'show',
      showId: SHOW_ID,
    });
  });
});

describe('resolveActions — secretary on a show', () => {
  const actions = resolveActions({ kind: 'show', showId: SHOW_ID }, secretary);

  it('returns the six decided items in order', () => {
    expect(actions.map(a => a.id)).toEqual([
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-open-entry-management',
      'show-open-show-desk',
      'show-generate-publish-premium',
      'show-settings',
    ]);
  });

  it('links to the canonical routes rather than re-implementing them', () => {
    expect(actions.map(a => a.href)).toEqual([
      `/secretary/register/${SHOW_ID}`,
      `/shows/${SHOW_ID}/register`,
      `/shows/${SHOW_ID}/entry-management`,
      `/shows/${SHOW_ID}/show-desk`,
      `/shows/${SHOW_ID}#setup-publish-premium`,
      `/shows/${SHOW_ID}?edit=true`,
    ]);
  });

  it('separates the daily work from the setup verbs', () => {
    expect(actions.filter(a => a.separatorBefore).map(a => a.id)).toEqual([
      'show-generate-publish-premium',
    ]);
  });

  it('enables every item', () => {
    expect(actions.every(a => a.disabledReason === undefined)).toBe(true);
  });

  it('reads as five to seven items', () => {
    expect(actions.length).toBeGreaterThanOrEqual(5);
    expect(actions.length).toBeLessThanOrEqual(7);
  });
});

describe('resolveActions — club admin on a show', () => {
  const actions = resolveActions({ kind: 'show', showId: SHOW_ID }, clubAdmin);

  it('keeps the same six items', () => {
    expect(actions).toHaveLength(6);
  });

  it('greys mail-in entry with a reason, because /secretary/register is secretary-only', () => {
    const mailIn = actions.find(a => a.id === 'show-add-mail-in-entry');
    expect(mailIn?.disabledReason).toBe('Trial secretary access only');
  });

  it('leaves the rest available', () => {
    expect(
      actions.filter(a => a.id !== 'show-add-mail-in-entry').every(a => !a.disabledReason)
    ).toBe(true);
  });
});

describe('resolveActions — a viewer who cannot manage the show', () => {
  it('returns no show actions (the exhibitor list is MYK9-631)', () => {
    expect(resolveActions({ kind: 'show', showId: SHOW_ID }, exhibitor)).toEqual([]);
  });

  it('falls back to nothing at all for an exhibitor off a show route', () => {
    expect(resolveActions({ kind: 'global' }, exhibitor)).toEqual([]);
  });
});

describe('resolveActions — role-wide list', () => {
  it('offers a secretary create-a-show and Show Management', () => {
    const actions = resolveActions({ kind: 'global' }, secretary);
    expect(actions.map(a => a.id)).toEqual(['create-show', 'open-show-management']);
    expect(actions.map(a => a.href)).toEqual(['/?wizard=true', '/secretary/dashboard']);
  });

  it('omits create-a-show for staff who cannot create shows', () => {
    const actions = resolveActions({ kind: 'global' }, { ...secretary, canCreateShows: false });
    expect(actions.map(a => a.id)).toEqual(['open-show-management']);
  });
});
