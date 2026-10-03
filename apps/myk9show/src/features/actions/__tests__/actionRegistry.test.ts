import { describe, it, expect } from 'vitest';
import {
  mergeSearchOnlyHref,
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
      `/shows/${SHOW_ID}/show-day`,
      `/shows/${SHOW_ID}/entries`,
      `/shows/${SHOW_ID}/trials/t1/classes/c1`,
      `/shows/${SHOW_ID}/register`,
      `/secretary/register/${SHOW_ID}`,
    ]) {
      expect(parseActionRouteContext(path)).toMatchObject({ kind: 'show', showId: SHOW_ID });
    }
  });

  it('knows where the management shell is mounted and where it is not', () => {
    // `?edit=true` has exactly one consumer, `ShowManagementShell`, and it is
    // the element at `/shows/:id`. Its nested children get it; its SIBLING
    // routes do not, so a relative param there would sit in the URL with
    // nothing to open it.
    for (const mounted of [
      `/shows/${SHOW_ID}`,
      `/shows/${SHOW_ID}/`,
      `/shows/${SHOW_ID}/entries`,
      `/shows/${SHOW_ID}/show-day`,
      `/shows/${SHOW_ID}/results`,
      `/shows/${SHOW_ID}/classes/trial-1`,
    ]) {
      expect(parseActionRouteContext(mounted), mounted).toMatchObject({ shellMounted: true });
    }
    for (const sibling of [
      `/shows/${SHOW_ID}/register`,
      `/shows/${SHOW_ID}/trials/trial-1`,
      `/shows/${SHOW_ID}/trials/trial-1/classes/class-1`,
      `/shows/${SHOW_ID}/trials/trial-1/classes/class-1/results`,
    ]) {
      expect(parseActionRouteContext(sibling), sibling).toMatchObject({ shellMounted: false });
    }
  });

  it('is global off a show route', () => {
    for (const path of ['/', '/shows', '/dogs', '/secretary/dashboard', '/shows/']) {
      expect(parseActionRouteContext(path)).toEqual({ kind: 'global' });
    }
  });

  it('treats the literal /shows/ segments as global — they are not shows', () => {
    // `/shows/new` and `/shows/browse` are real routes that redirect into the
    // wizard and the browse list (`publicRoutes.tsx`). Parsed as shows they
    // offered a secretary six actions against the show id "new" or "browse",
    // every one of them a dead link.
    for (const path of ['/shows/new', '/shows/new/', '/shows/browse', '/shows/browse/']) {
      expect(parseActionRouteContext(path)).toEqual({ kind: 'global' });
    }
    expect(resolveActions(parseActionRouteContext('/shows/new'), secretary)).toEqual([
      { id: 'create-show', label: 'Add Show', href: '/?wizard=true' },
      { id: 'open-show-management', label: 'Open Show Management', href: '/secretary/dashboard' },
    ]);
  });

  it('decodes an encoded show id and ignores a trailing slash or query-free hash', () => {
    expect(parseActionRouteContext(`/shows/${SHOW_ID}/`)).toMatchObject({
      kind: 'show',
      showId: SHOW_ID,
    });
  });
});

const SHOW_CONTEXT = { kind: 'show', showId: SHOW_ID, shellMounted: true } as const;
const SIBLING_CONTEXT = { kind: 'show', showId: SHOW_ID, shellMounted: false } as const;

describe('resolveActions — secretary on a show', () => {
  const actions = resolveActions(SHOW_CONTEXT, secretary);

  it('puts Edit show first and opens the edit panel where the secretary stands', () => {
    // MYK9-928: Edit is the first item of every page's Actions menu and the
    // header button is gone. Search-only where the shell is mounted, so the panel
    // opens over the section the secretary is on and closing it leaves them there.
    const first = actions[0];
    expect(first?.id).toBe('show-settings');
    expect(first?.label).toBe('Edit show');
    expect(first?.href).toBe('?edit=true');
    expect(first?.separatorBefore).toBeUndefined();
    expect(actions.some(action => action.href?.endsWith('/setup'))).toBe(false);
  });

  it('sends Edit show to the show page from a sibling route, where the panel lives', () => {
    const siblingActions = resolveActions(SIBLING_CONTEXT, secretary);
    const details = siblingActions.find(action => action.id === 'show-settings');
    expect(details?.label).toBe('Edit show');
    expect(details?.href).toBe(`/shows/${SHOW_ID}?edit=true`);
  });

  it('runs the premium flow as a command, never as a hash link', () => {
    // A pushed hash is not fragment navigation: at 375x812 nothing scrolled at
    // all, and from another section the card arrived unhighlighted. The item is
    // a side effect now, bound to the card's own flow by `useCurrentActions`.
    const premium = actions.find(action => action.id === 'show-generate-publish-premium');
    expect(premium?.command).toBe('publish-premium');
    expect(premium?.href).toBeUndefined();
    expect(actions.some(action => action.href?.includes('#'))).toBe(false);
  });

  it('returns the items in group order: Edit, Add, navigation, status', () => {
    expect(actions.map(a => a.id)).toEqual([
      'show-settings',
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-add-new-trial',
      'show-add-classes',
      'show-open-entry-management',
      'show-generate-publish-premium',
    ]);
  });

  it('links to the canonical routes rather than re-implementing them', () => {
    expect(actions.map(a => a.href)).toEqual([
      '?edit=true', // the edit panel, over the current section
      `/secretary/register/${SHOW_ID}`,
      `/shows/${SHOW_ID}/register`,
      `/secretary/create-show/wizard?showId=${SHOW_ID}&mode=add-trials`,
      `/secretary/create-show/wizard?showId=${SHOW_ID}&mode=add-classes`,
      `/shows/${SHOW_ID}/entries`,
      undefined, // the premium flow is a command, not a place
    ]);
  });

  it('gives every item exactly one of href or command', () => {
    for (const action of actions) {
      expect(
        (action.href !== undefined) !== (action.command !== undefined),
        `${action.id} must be a destination or a side effect, not both or neither`
      ).toBe(true);
    }
  });

  it('separates the groups: Add after Edit, status after the rest', () => {
    expect(actions.filter(a => a.separatorBefore).map(a => a.id)).toEqual([
      'show-add-mail-in-entry',
      'show-generate-publish-premium',
    ]);
  });

  it('enables every item', () => {
    expect(actions.every(a => a.disabledReason === undefined)).toBe(true);
  });

  it('stays a short menu', () => {
    expect(actions.length).toBeLessThanOrEqual(10);
  });
});

describe('resolveActions — club admin on a show', () => {
  const actions = resolveActions(SHOW_CONTEXT, clubAdmin);

  // "Open Show Day" went with the tab (MYK9-957): the show home is the page this menu opens over.
  it('keeps the same seven items', () => {
    expect(actions).toHaveLength(7);
  });

  it('greys mail-in entry with a reason, because /secretary/register is secretary-only', () => {
    const mailIn = actions.find(a => a.id === 'show-add-mail-in-entry');
    expect(mailIn?.disabledReason).toBe('Trial secretary access only');
  });

  it('lets an owning-club admin without the secretary role add trials and classes (MYK9-928)', () => {
    // The old Setup toolbar buttons were gated on show management, and the wizard admits
    // CLUB_ADMIN, so the relocated items are too.
    for (const id of ['show-add-new-trial', 'show-add-classes']) {
      const item = actions.find(a => a.id === id);
      expect(item, id).toBeDefined();
      expect(item?.disabledReason, id).toBeUndefined();
    }
  });

  it('keeps mail-in entry greyed, the one Add the secretary role alone owns', () => {
    expect(actions.find(a => a.id === 'show-add-mail-in-entry')?.disabledReason).toBe(
      'Trial secretary access only'
    );
  });

  it('leaves the rest available', () => {
    expect(
      actions.filter(a => a.id !== 'show-add-mail-in-entry').every(a => !a.disabledReason)
    ).toBe(true);
  });
});

describe('resolveActions — a viewer who cannot manage the show', () => {
  it('returns no show actions (the exhibitor list is MYK9-631)', () => {
    expect(resolveActions(SHOW_CONTEXT, exhibitor)).toEqual([]);
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

describe('resolveActions — the object a detail page registers (MYK9-928)', () => {
  const GLOBAL = { kind: 'global' } as const;

  it.each([
    ['trial', 'Edit trial'],
    ['class', 'Edit class'],
    ['club', 'Edit club'],
    ['dog', 'Edit dog'],
    ['person', 'Edit person'],
  ] as const)(
    'puts "%s" Edit first as a command, with no destination of its own',
    (kind, label) => {
      const actions = resolveActions(GLOBAL, { ...secretary, pageObject: { kind } });
      expect(actions[0]).toMatchObject({ id: `${kind}-edit`, label, command: 'edit-object' });
      expect(actions[0]?.href).toBeUndefined();
      expect(actions[0]?.separatorBefore).toBeUndefined();
    }
  );

  it('offers an exhibitor their dog Edit and nothing else', () => {
    expect(
      resolveActions(GLOBAL, { ...exhibitor, pageObject: { kind: 'dog' } }).map(a => a.id)
    ).toEqual(['dog-edit']);
  });

  it('offers nothing extra when the page registered no object (gate closed)', () => {
    expect(resolveActions(GLOBAL, { ...exhibitor, pageObject: null })).toEqual([]);
    expect(resolveActions(GLOBAL, exhibitor)).toEqual([]);
  });

  it('puts the trial group first, then the show list behind a divider', () => {
    const actions = resolveActions(SIBLING_CONTEXT, {
      ...secretary,
      pageObject: { kind: 'trial', addClassesHref: '/secretary/create-show/wizard?mode=x' },
    });
    expect(actions.slice(0, 3).map(a => a.id)).toEqual([
      'trial-edit',
      'trial-add-classes',
      'show-settings',
    ]);
    expect(actions[1]?.href).toBe('/secretary/create-show/wizard?mode=x');
    expect(actions[2]?.separatorBefore).toBe(true);
  });

  it('offers ONE Add classes on a trial page: the trial-focused one replaces the show-wide one', () => {
    const actions = resolveActions(SIBLING_CONTEXT, {
      ...secretary,
      pageObject: { kind: 'trial', addClassesHref: '/wizard?trialId=t1' },
    });
    expect(actions.filter(a => a.label === 'Add classes').map(a => a.id)).toEqual([
      'trial-add-classes',
    ]);
  });

  it('keeps the show-wide Add classes on a trial page that registered no trial one', () => {
    const actions = resolveActions(SIBLING_CONTEXT, {
      ...secretary,
      pageObject: { kind: 'trial' },
    });
    expect(actions.map(a => a.id)).toContain('show-add-classes');
  });

  it("carries Setup's selected trial into the show Add classes", () => {
    const actions = resolveActions(SHOW_CONTEXT, { ...secretary, addClassesTrialId: 't3' });
    expect(actions.find(a => a.id === 'show-add-classes')?.href).toBe(
      `/secretary/create-show/wizard?showId=${SHOW_ID}&mode=add-classes&trialId=t3`
    );
  });

  it('omits trial Add classes when the page has no destination for it', () => {
    const actions = resolveActions(SIBLING_CONTEXT, {
      ...secretary,
      pageObject: { kind: 'trial' },
    });
    expect(actions.map(a => a.id)).not.toContain('trial-add-classes');
  });

  it('gives an exhibitor on a trial page no show actions, so the page edit stands alone', () => {
    expect(
      resolveActions(SIBLING_CONTEXT, { ...exhibitor, pageObject: { kind: 'class' } }).map(
        a => a.id
      )
    ).toEqual(['class-edit']);
  });
});

describe('mergeSearchOnlyHref', () => {
  it("adds a search-only action's params to the viewer's current ones", () => {
    expect(mergeSearchOnlyHref('?edit=true', '?queue=needs-review&q=rex')).toBe(
      '?queue=needs-review&q=rex&edit=true'
    );
  });

  it('lets the action win a key it shares with the current URL', () => {
    expect(mergeSearchOnlyHref('?edit=true', '?edit=false&q=rex')).toBe('?edit=true&q=rex');
  });

  it('leaves an absolute href alone', () => {
    expect(mergeSearchOnlyHref('/shows/s1?edit=true', '?q=rex')).toBe('/shows/s1?edit=true');
  });

  it('works with no current search', () => {
    expect(mergeSearchOnlyHref('?edit=true', '')).toBe('?edit=true');
  });
});

describe('Delete never lives in the Actions menu (CRUD standard decision 3)', () => {
  it('offers no destructive or delete item to any viewer on any page', () => {
    const kinds = ['trial', 'class', 'club', 'dog', 'person'] as const;
    for (const viewer of [secretary, clubAdmin, exhibitor]) {
      for (const pageObject of [null, ...kinds.map(kind => ({ kind }))]) {
        for (const route of [
          parseActionRouteContext(`/shows/${SHOW_ID}`),
          parseActionRouteContext('/'),
        ]) {
          const actions = resolveActions(route, { ...viewer, pageObject });
          for (const action of actions) {
            expect(action.label).not.toMatch(/delete|remove/i);
            expect(action.destructive).not.toBe(true);
          }
        }
      }
    }
  });
});
