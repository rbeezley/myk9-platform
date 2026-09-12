import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';

/**
 * The ownership gate as a STATE MACHINE.
 *
 * PR #2180 went through fifteen review rounds because this logic lived as three
 * or four loose booleans spread across a data hook, a page and a route guard.
 * Every fix for one window (cold store, offline, show-not-found, site admin)
 * opened another, and nothing pinned the transitions. These tests pin them:
 * one case per (viewer x show-read outcome) pair, so a regression names the
 * exact state that broke instead of surfacing as a flash of the wrong surface.
 */

const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useShowStore: vi.fn(),
  useShowQuery: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: mocks.useShowQuery }));

import { useShowManageScope } from '../useShowManageScope';

const SHOW_ID = '11111111-1111-4111-8111-111111111111';
const OWNING_CLUB = 'club-1';

/** A viewer holding `role` scoped to `clubId`, with `hasRole` kept consistent. */
function viewer(role: string | null, clubId = OWNING_CLUB) {
  return {
    hasRole: (r: string) => r === role,
    userWithRoles: role
      ? { scopes: [{ scopeType: 'club', scopeId: clubId, roleId: role }] }
      : { scopes: [] },
  };
}

/** The show read's outcome, in the shape react-query reports it. */
function showRead({
  data = undefined as { id: string; clubId: string } | undefined,
  isLoading = false,
  isPlaceholderData = false,
} = {}) {
  return { data, isLoading, isPlaceholderData };
}

function setup(args: {
  auth: ReturnType<typeof viewer>;
  storedShows?: { id: string; clubId: string }[];
  read?: ReturnType<typeof showRead>;
  showId?: string | undefined;
}) {
  // Read `showId` with an `in` check, not a destructuring default: a default
  // fires on an explicit `undefined` too, which would silently substitute a
  // real id in the "show id not known yet" case and test the wrong state.
  const showId = 'showId' in args ? args.showId : SHOW_ID;
  mocks.useAuthContext.mockReturnValue(args.auth);
  mocks.useShowStore.mockReturnValue({ shows: args.storedShows ?? [] });
  mocks.useShowQuery.mockReturnValue(args.read ?? showRead());
  return renderHook(() => useShowManageScope(showId)).result;
}

describe('useShowManageScope', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('site admin — global, so ownership never gates them', () => {
    it('grants immediately while the show read is still in flight', () => {
      const result = setup({
        auth: viewer('site_admin'),
        read: showRead({ isLoading: true }),
      });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: true });
    });

    it('still grants when the show cannot be read at all', () => {
      const result = setup({ auth: viewer('site_admin'), read: showRead() });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: true });
    });
  });

  describe('viewer holding no club-staff role', () => {
    it('is denied immediately, with no resolving window', () => {
      const result = setup({ auth: viewer('exhibitor'), read: showRead({ isLoading: true }) });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: false });
    });

    it('pays for no show read at all', () => {
      setup({ auth: viewer('exhibitor') });

      // An empty id is how useShowQuery is told to stand down.
      expect(mocks.useShowQuery).toHaveBeenCalledWith('');
    });
  });

  describe('club-scoped secretary', () => {
    it('resolves offline from the replicated store, with no network read', () => {
      const result = setup({
        auth: viewer('secretary'),
        storedShows: [{ id: SHOW_ID, clubId: OWNING_CLUB }],
      });

      expect(result.current).toMatchObject({
        status: 'resolved',
        canManage: true,
        clubId: OWNING_CLUB,
      });
      expect(mocks.useShowQuery).toHaveBeenCalledWith('');
    });

    it('HOLDS (resolving) while the show read is in flight on a cold store', () => {
      const result = setup({ auth: viewer('secretary'), read: showRead({ isLoading: true }) });

      expect(result.current).toMatchObject({ status: 'resolving', canManage: false });
    });

    it('grants once the read confirms their own club owns the show', () => {
      const result = setup({
        auth: viewer('secretary'),
        read: showRead({ data: { id: SHOW_ID, clubId: OWNING_CLUB } }),
      });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: true });
    });

    it('denies a secretary of a different club', () => {
      const result = setup({
        auth: viewer('secretary', 'club-2'),
        read: showRead({ data: { id: SHOW_ID, clubId: OWNING_CLUB } }),
      });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: false });
    });

    it('treats STALE placeholder data as unresolved rather than scoping to the previous show', () => {
      // `placeholderData: previousData` is set app-wide, so a show-id change
      // hands back the PREVIOUS show. Granting on it would scope the viewer to
      // the wrong club for a frame.
      const result = setup({
        auth: viewer('secretary'),
        read: showRead({ data: { id: 'other-show', clubId: OWNING_CLUB }, isPlaceholderData: true }),
      });

      expect(result.current).toMatchObject({ status: 'resolving', canManage: false });
    });

    it('reports UNAVAILABLE when the read settles with no show', () => {
      // Offline with a cold replication store, a soft-deleted show, or a 404.
      // Distinct from `resolving`: callers must surface a degraded state rather
      // than hold a spinner forever or silently demote the viewer.
      const result = setup({ auth: viewer('secretary'), read: showRead() });

      expect(result.current).toMatchObject({ status: 'unavailable', canManage: false });
    });

    it('holds while the show id itself is still unknown', () => {
      const result = setup({ auth: viewer('secretary'), showId: undefined });

      expect(result.current).toMatchObject({ status: 'resolving', canManage: false });
    });
  });

  describe('club admin', () => {
    it('is granted on their own club’s show', () => {
      const result = setup({
        auth: viewer('club_admin'),
        read: showRead({ data: { id: SHOW_ID, clubId: OWNING_CLUB } }),
      });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: true });
    });

    it('is denied on another club’s show', () => {
      const result = setup({
        auth: viewer('club_admin', 'club-2'),
        read: showRead({ data: { id: SHOW_ID, clubId: OWNING_CLUB } }),
      });

      expect(result.current).toMatchObject({ status: 'resolved', canManage: false });
    });
  });
});
