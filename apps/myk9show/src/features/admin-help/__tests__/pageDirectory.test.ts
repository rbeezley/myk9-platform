import { describe, it, expect } from 'vitest';
import { pageDirectory } from '../data/pageDirectory';
import { fullRouteRegistry } from '@/routes/routeRegistry';

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
