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
      { id: 'create-show', label: 'Create a show', href: '/?wizard=true' },
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

  it('puts Show settings last and opens the panel WHERE THE VIEWER IS', () => {
    // Richard, 2026-09-17: "Show settings is the last item in the header Actions
    // menu and opens the existing Show Edit panel (`?edit=true`). No separate
    // settings page; /shows/:id/setup redirects to /shows/:id."
    //
    // Search-only, so it resolves against the current path. An ABSOLUTE
    // `/shows/:id?edit=true` walked a secretary off Entry Management to
    // Overview and stranded them there when they closed the panel; the deleted
    // `...` menu opened it in place on every section.
    const last = actions[actions.length - 1];
    expect(last?.id).toBe('show-settings');
    expect(last?.href).toBe('?edit=true');
    expect(last?.href?.startsWith('/')).toBe(false);
    expect(actions.some(action => action.href?.endsWith('/setup'))).toBe(false);
  });

  it('sends Show settings to Overview on a route with no shell to open it', () => {
    // `/shows/:id/register` and `/shows/:id/trials/...` are SIBLINGS of
    // `/shows/:id`, so no `ShowManagementShell` is mounted and a relative
    // `?edit=true` would be a stray param that opens nothing.
    const siblingActions = resolveActions(SIBLING_CONTEXT, secretary);
    const settings = siblingActions.find(action => action.id === 'show-settings');
    expect(settings?.href).toBe(`/shows/${SHOW_ID}?edit=true`);
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
      '?edit=true',
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
