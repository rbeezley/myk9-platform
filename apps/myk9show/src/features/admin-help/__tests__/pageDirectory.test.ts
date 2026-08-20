import { describe, it, expect } from 'vitest';
import { pageDirectory } from '../data/pageDirectory';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import { UserRole } from '@/types/auth-types';

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

  // The directory is hand-authored and deliberately omits redirect-only routes
  // (asserted above for the legacy /secretary/shows paths), and nothing enforces
  // that a new route gets an entry — the drift panel reports that at runtime.
  // So no copy on this surface may claim it covers "every page".
  it('the self-entry does not claim to cover every page', () => {
    const entry = pageDirectory.find(e => e.path === '/admin/help');
    expect(entry?.description).not.toMatch(/every page/i);
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
