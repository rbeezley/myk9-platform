import type { ReactNode } from 'react';
import { describe, it, expect } from 'vitest';
import { pageDirectory } from '../data/pageDirectory';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import { routeDiff } from '../utils/routeDiff';
import { UserRole } from '@/types/auth-types';
import { router } from '@/router';
import { routeSurfaceKind, type RouteSurfaceKind } from './routeSurfaceKind';

describe('pageDirectory (invariant)', () => {
  it('every entry path exists in fullRouteRegistry', () => {
    const registryPaths = new Set(Object.keys(fullRouteRegistry));
    const stray = pageDirectory.map(e => e.path).filter(p => !registryPaths.has(p));
    expect(stray).toEqual([]);
  });

  it('has no duplicate paths', () => {
    const paths = pageDirectory.map(e => e.path);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });

  it('uses the canonical show creation wizard route', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).toContain('/secretary/create-show/wizard');
    expect(paths).not.toContain('/secretary/classes');
  });

  it('catalogs show discovery without the retired duplicate calendar route', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).toContain('/shows');
    expect(paths).not.toContain('/calendar');
    expect(Object.keys(fullRouteRegistry)).not.toContain('/calendar');
    expect(pageDirectory.find(e => e.path === '/shows')?.linksTo).not.toContain('/calendar');
  });

  it('catalogs canonical show management paths instead of legacy secretary show pages', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).toContain('/shows/:showId/setup');
    expect(paths).toContain('/shows/:showId/show-desk');
    expect(paths).toContain('/shows/:showId/entry-management');
    expect(paths).toContain('/shows/:showId/reports');
    expect(paths).toContain('/shows/:showId/results-control');
    expect(paths).toContain('/shows/:showId/submit-results');
    expect(paths).not.toContain('/secretary/shows/:showId');
    expect(paths).not.toContain('/secretary/shows/:showId/results-control');
    expect(paths).not.toContain('/secretary/run-order');
  });

  it('catalogs Results without assigning self check-in to the closeout page', () => {
    const results = pageDirectory.find(e => e.path === '/shows/:showId/results-control');
    expect(results?.title).toBe('Results');
    expect(`${results?.title} ${results?.description}`).not.toMatch(/check-in/i);
  });

  it('matches canonical show management roles to the route guard', () => {
    const managementPaths = [
      '/shows/:showId/setup',
      '/shows/:showId/show-desk',
      '/shows/:showId/entry-management',
      '/shows/:showId/reports',
      '/shows/:showId/results-control',
      '/shows/:showId/submit-results',
    ];

    for (const path of managementPaths) {
      const entry = pageDirectory.find(e => e.path === path);
      expect(entry?.roles).toEqual([UserRole.SECRETARY, UserRole.SITE_ADMIN]);
    }
  });

  it('catalogs the deferred payment-surface routes (PR #1002 follow-up)', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).toContain('/exhibitor/payments');
    expect(paths).toContain('/club-admin/members');
    expect(paths).toContain('/club-admin/payments');
  });

  it('scopes the club-admin payment surfaces to club-admin and site-admin', () => {
    for (const path of ['/club-admin/members', '/club-admin/payments']) {
      const entry = pageDirectory.find(e => e.path === path);
      expect(entry?.roles).toEqual([UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]);
    }
  });

  it('catalogs sidebar-visible role pages that are safe for customer docs', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/admin/users',
        '/admin/role-requests',
        '/admin/payouts',
        '/people',
        '/exhibitor/payments',
        '/club-admin/members',
        '/club-admin/payments',
      ])
    );
  });

  it('does not catalog deleted browser-local admin health pages', () => {
    const paths = pageDirectory.map(e => e.path);
    expect(paths).not.toContain('/admin/alerts');
    expect(paths).not.toContain('/admin/performance');

    const searchableText = pageDirectory
      .filter(e => e.category === 'Admin')
      .map(e => `${e.title} ${e.description}`)
      .join(' ');
    expect(searchableText).not.toMatch(/Alerts & Monitoring|Performance Dashboard/);
  });

  it('every entry has a non-empty title and description', () => {
    const invalid = pageDirectory.filter(e => !e.title.trim() || !e.description.trim());
    expect(invalid).toEqual([]);
  });

  it('every entry has at least one role', () => {
    const invalid = pageDirectory.filter(e => e.roles.length === 0);
    expect(invalid).toEqual([]);
  });

  it('links /admin/permissions to /admin/users, since it renders an unconditional quick-action card there', () => {
    const entry = pageDirectory.find(e => e.path === '/admin/permissions');
    expect(entry?.linksTo).toContain('/admin/users');
  });

  // /support was the directory's one genuine gap: a real, working, user-facing
  // page with no entry. It is unreachable from the nav — its only entry point is
  // the support push notification's ?ticketId deep link — which is exactly why
  // it went uncatalogued, and exactly why a site admin needs it listed.
  it('catalogs the notification-only /support page', () => {
    const entry = pageDirectory.find(e => e.path === '/support');
    expect(entry).toBeDefined();
    // Bare <ProtectedRoute>, no requiredRoles: every role section gets it.
    expect(entry?.roles).toEqual([
      UserRole.SITE_ADMIN,
      UserRole.SECRETARY,
      UserRole.CLUB_ADMIN,
      UserRole.JUDGE,
      UserRole.EXHIBITOR,
    ]);
    // The deep-link requirement is the single most surprising thing about this
    // page. If the description stops saying so, the entry has lost its point.
    expect(entry?.description).toMatch(/ticketId/);
  });

  // The directory is hand-authored and deliberately omits redirect-only routes
  // (asserted above for the legacy /secretary/shows paths), and the coverage
  // gate below reaches only registered routes — a routed-but-unregistered page
  // like /account is invisible to both it and the drift panel.
  // So no copy on this surface may claim it covers "every page".
  it('the self-entry does not claim to cover every page', () => {
    const entry = pageDirectory.find(e => e.path === '/admin/help');
    expect(entry?.description).not.toMatch(/every page/i);
  });

  /**
   * Registered routes allowed to have no directory entry.
   *
   * Both are LegacySecretaryShowRedirect — redirects superseded by the
   * canonical /shows/:showId/* paths, and asserted absent from the directory
   * above. Being a redirect is NOT what earns a slot here (/my-entries and
   * /browse-shows are redirects and ARE catalogued); being deliberately
   * retired is.
   */
  const DRIFT_ALLOWLIST = ['/secretary/shows/:showId', '/secretary/shows/:showId/*'];

  // The existing invariant at the top of this file enforces one direction only:
  // no entry may point at a path the registry lacks. The reverse — a route with
  // nobody documenting it — was left to the runtime drift panel, which is
  // advisory: /support sat uncatalogued in it rather than failing anything.
  //
  // This closes that direction. A new route now fails here until it is either
  // catalogued or consciously added to the allowlist above, and the allowlist is
  // exact rather than a floor, so a retired route that regains an entry (or a
  // stale allowlist line) fails too.
  it('every registered route is catalogued, except the deliberately retired ones', () => {
    const { missing, extra } = routeDiff(fullRouteRegistry, pageDirectory);

    expect(extra).toEqual([]);
    expect(missing).toEqual([...DRIFT_ALLOWLIST].sort());
  });

  // Guards the allowlist itself: a line that no longer names a real route is
  // dead permission, and would silently keep excusing nothing while reading as
  // though it still covers something.
  it('every allowlisted path is still a registered route', () => {
    const registryPaths = new Set(Object.keys(fullRouteRegistry));
    const stale = DRIFT_ALLOWLIST.filter(p => !registryPaths.has(p));
    expect(stale).toEqual([]);
  });

  it('every linksTo path resolves to an existing PageEntry path', () => {
    const knownPaths = new Set(pageDirectory.map(e => e.path));
    const orphans: string[] = [];
    for (const entry of pageDirectory) {
      for (const target of entry.linksTo ?? []) {
        if (!knownPaths.has(target)) {
          orphans.push(`${entry.path} → ${target}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

/**
 * MYK9-476. The directory described two retired redirects as working
 * critical-path show-day features, and four more `park` rows as working while
 * they rendered a redirect or a disabled-flag placeholder. Path existence — the
 * only thing the invariants above checked — was true for every one of them.
 *
 * These tests read what each route ACTUALLY renders out of the router's own
 * element tree (see routeSurfaceKind.ts), so a row cannot go back to
 * advertising a redirect as a feature.
 */
describe('pageDirectory (status and linksTo tell the truth about the route)', () => {
  /**
   * Paths deliberately removed from the app. Declared rather than derived so an
   * accidental reintroduction fails loudly instead of quietly re-passing.
   */
  const RETIRED_PATHS = ['/exhibitor/show-day', '/exhibitor/check-in/:entryId', '/calendar'];

  function joinRoutePaths(parentPath: string, childPath: string): string {
    if (childPath.startsWith('/')) return childPath;
    return `${parentPath}/${childPath}`.replace(/\/+/g, '/');
  }

  function routePatternSignature(path: string): string {
    return path
      .split('/')
      .filter(Boolean)
      .map(segment => (segment.startsWith(':') ? ':' : segment === '*' ? '*' : segment))
      .join('/');
  }

  function collectElements(
    routes: typeof router.routes,
    parentPath = '',
    out = new Map<string, ReactNode>()
  ): Map<string, ReactNode> {
    for (const route of routes) {
      const path = route.path ? joinRoutePaths(parentPath, route.path) : parentPath;
      if (route.path && route.element) {
        out.set(routePatternSignature(path), route.element as ReactNode);
      }
      collectElements(route.children ?? [], path, out);
    }
    return out;
  }

  const elementsBySignature = collectElements(router.routes);

  function kindOf(path: string): RouteSurfaceKind {
    const element = elementsBySignature.get(routePatternSignature(path));
    return element === undefined ? 'unknown' : routeSurfaceKind(element);
  }

  // Positive control. Without it, a classifier that returned 'page' for
  // everything — a broken import, a wrapper set that swallows the whole tree —
  // would make every assertion below pass while measuring nothing.
  it('the classifier actually recognises a redirect and a disabled-flag placeholder', () => {
    // A bare <Route element={<Navigate to="/shows" replace />} />.
    expect(kindOf('/browse-shows')).toBe('redirect');
    // featurePage(features.analytics === false, ...) → <ComingSoonPage />.
    expect(kindOf('/exhibitor/analytics')).toBe('placeholder');
    // A real page, for contrast.
    expect(kindOf('/exhibitor/entries')).toBe('page');
  });

  it('every directory path resolves to a route in the application route tree', () => {
    const unresolved = pageDirectory.map(e => e.path).filter(p => kindOf(p) === 'unknown');
    expect(unresolved).toEqual([]);
  });

  it("no entry claims status 'working' while its route renders only a redirect or a placeholder", () => {
    const lying = pageDirectory
      .filter(e => e.status === 'working')
      .map(e => ({ path: e.path, renders: kindOf(e.path) }))
      .filter(r => r.renders === 'redirect' || r.renders === 'placeholder');
    expect(lying).toEqual([]);
  });

  it("every entry whose route renders only a redirect or a placeholder is marked 'stub'", () => {
    const mismarked = pageDirectory
      .map(e => ({ path: e.path, status: e.status, renders: kindOf(e.path) }))
      .filter(
        r => (r.renders === 'redirect' || r.renders === 'placeholder') && r.status !== 'stub'
      );
    expect(mismarked).toEqual([]);
  });

  it('no retired path survives in the registry, the directory, or any linksTo', () => {
    expect(Object.keys(fullRouteRegistry).filter(p => RETIRED_PATHS.includes(p))).toEqual([]);
    expect(pageDirectory.map(e => e.path).filter(p => RETIRED_PATHS.includes(p))).toEqual([]);

    const claims: string[] = [];
    for (const entry of pageDirectory) {
      for (const target of entry.linksTo ?? []) {
        if (RETIRED_PATHS.includes(target)) claims.push(`${entry.path} → ${target}`);
      }
    }
    expect(claims).toEqual([]);
  });

  it('every linksTo target is a live registered route, not a dangling path', () => {
    const registryPaths = new Set(Object.keys(fullRouteRegistry));
    const dangling: string[] = [];
    for (const entry of pageDirectory) {
      for (const target of entry.linksTo ?? []) {
        if (!registryPaths.has(target) || kindOf(target) === 'unknown') {
          dangling.push(`${entry.path} → ${target}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('MyEntriesPage is reachable from exactly one canonical route', () => {
    // /my-entries is a redirect now; only /exhibitor/entries renders the page.
    expect(kindOf('/my-entries')).toBe('redirect');
    expect(kindOf('/exhibitor/entries')).toBe('page');

    // Where /my-entries lands, and that it keeps the query string and hash the
    // deep links ride on, is pinned behaviourally in
    // routes/MyEntriesRedirect.test.tsx.
  });
});
