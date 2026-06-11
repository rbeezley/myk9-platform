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

  it('every entry has a non-empty title and description', () => {
    const invalid = pageDirectory.filter(e => !e.title.trim() || !e.description.trim());
    expect(invalid).toEqual([]);
  });

  it('every entry has at least one role', () => {
    const invalid = pageDirectory.filter(e => e.roles.length === 0);
    expect(invalid).toEqual([]);
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
