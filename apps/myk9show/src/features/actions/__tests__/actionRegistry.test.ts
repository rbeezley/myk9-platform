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

  it('puts Edit show details last and opens the edit panel where the secretary stands', () => {
    // MYK9-736: the hero's Edit button moved here. Search-only where the shell
    // is mounted, so the panel opens over the section the secretary is on and
    // closing it leaves them there.
    const last = actions[actions.length - 1];
    expect(last?.id).toBe('show-settings');
    expect(last?.label).toBe('Edit show details');
    expect(last?.href).toBe('?edit=true');
    expect(actions.some(action => action.href?.endsWith('/setup'))).toBe(false);
  });

  it('sends Edit show details to the show page from a sibling route, where the panel lives', () => {
    const siblingActions = resolveActions(SIBLING_CONTEXT, secretary);
    const details = siblingActions.find(action => action.id === 'show-settings');
    expect(details?.label).toBe('Edit show details');
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

  it('returns the seven decided items in order', () => {
    expect(actions.map(a => a.id)).toEqual([
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-open-entry-management',
      'show-open-show-desk',
      'show-add-new-trial',
      'show-generate-publish-premium',
      'show-settings',
    ]);
  });

  it('links to the canonical routes rather than re-implementing them', () => {
    expect(actions.map(a => a.href)).toEqual([
      `/secretary/register/${SHOW_ID}`,
      `/shows/${SHOW_ID}/register`,
      `/shows/${SHOW_ID}/entries`,
      `/shows/${SHOW_ID}/show-day`,
      `/secretary/create-show/wizard?showId=${SHOW_ID}&mode=add-trials`,
      undefined, // the premium flow is a command, not a place
      '?edit=true', // the edit panel, over the current section
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
  const actions = resolveActions(SHOW_CONTEXT, clubAdmin);

  it('keeps the same seven items', () => {
    expect(actions).toHaveLength(7);
  });

  it('greys mail-in entry with a reason, because /secretary/register is secretary-only', () => {
    const mailIn = actions.find(a => a.id === 'show-add-mail-in-entry');
    expect(mailIn?.disabledReason).toBe('Trial secretary access only');
  });

  it('greys Add Trial for club admins, because trial setup is secretary-only', () => {
    const addTrial = actions.find(a => a.id === 'show-add-new-trial');
    expect(addTrial?.disabledReason).toBe('Trial secretary access only');
  });

  it('leaves the rest available', () => {
    expect(
      actions
        .filter(a => !['show-add-mail-in-entry', 'show-add-new-trial'].includes(a.id))
        .every(a => !a.disabledReason)
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
