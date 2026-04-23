import { describe, it, expect } from 'vitest';
import { routeDiff } from '../utils/routeDiff';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

const makeEntry = (path: string): PageEntry => ({
  path,
  title: path,
  description: '',
  roles: [UserRole.SITE_ADMIN],
  classification: 'critical-path',
  category: 'Admin',
  status: 'working',
});

describe('routeDiff', () => {
  it('returns empty sets when registry and directory match', () => {
    const registry = { '/a': () => Promise.resolve({ default: () => null as never }) };
    const directory = [makeEntry('/a')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it('flags routes in registry that lack a directory entry as missing', () => {
    const registry = {
      '/a': () => Promise.resolve({ default: () => null as never }),
      '/b': () => Promise.resolve({ default: () => null as never }),
    };
    const directory = [makeEntry('/a')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual(['/b']);
    expect(result.extra).toEqual([]);
  });

  it('flags directory entries with no matching registry route as extra', () => {
    const registry = { '/a': () => Promise.resolve({ default: () => null as never }) };
    const directory = [makeEntry('/a'), makeEntry('/gone')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['/gone']);
  });

  it('returns both sets sorted alphabetically for stable output', () => {
    const registry = {
      '/b': () => Promise.resolve({ default: () => null as never }),
      '/a': () => Promise.resolve({ default: () => null as never }),
    };
    const directory = [makeEntry('/z'), makeEntry('/y')];
    const result = routeDiff(registry, directory);
    expect(result.missing).toEqual(['/a', '/b']);
    expect(result.extra).toEqual(['/y', '/z']);
  });
});
