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

  it('every entry has a non-empty title and description', () => {
    const invalid = pageDirectory.filter(e => !e.title.trim() || !e.description.trim());
    expect(invalid).toEqual([]);
  });

  it('every entry has at least one role', () => {
    const invalid = pageDirectory.filter(e => e.roles.length === 0);
    expect(invalid).toEqual([]);
  });
});
