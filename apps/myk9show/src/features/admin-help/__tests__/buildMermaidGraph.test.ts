import { describe, it, expect } from 'vitest';
import { buildMermaidGraph, sanitizePath } from '../utils/buildMermaidGraph';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

function entry(path: string, linksTo?: string[]): PageEntry {
  return {
    path,
    title: path.split('/').filter(Boolean).pop() ?? 'root',
    description: 'test entry',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'test',
    status: 'working',
    linksTo,
  };
}

describe('sanitizePath', () => {
  it('strips leading slash and replaces / and : with _', () => {
    expect(sanitizePath('/admin/users/:id')).toBe('admin_users__id');
  });

  it('handles root path', () => {
    expect(sanitizePath('/')).toBe('root');
  });
});

describe('buildMermaidGraph', () => {
  it('returns empty string for empty pages array', () => {
    expect(buildMermaidGraph([])).toBe('');
  });

  it('emits an edge when both source and target are in pages', () => {
    const pages = [entry('/admin/users', ['/admin/users/:id']), entry('/admin/users/:id')];
    const graph = buildMermaidGraph(pages);
    expect(graph).toContain('admin_users --> admin_users__id');
  });

  it('omits edge when target path is not in pages', () => {
    const pages = [entry('/admin/users', ['/admin/missing'])];
    const graph = buildMermaidGraph(pages);
    expect(graph).not.toContain('-->');
  });

  it('includes a click directive for every node', () => {
    const pages = [entry('/admin/users')];
    const graph = buildMermaidGraph(pages);
    expect(graph).toContain('click admin_users __myk9FlowNav');
  });

  it('does not throw on cyclic edges (A → B → A)', () => {
    const pages = [entry('/a', ['/b']), entry('/b', ['/a'])];
    expect(() => buildMermaidGraph(pages)).not.toThrow();
  });

  it('escapes double-quotes in page titles so labels do not break graph syntax', () => {
    const pages = [{ ...entry('/a'), title: 'Say "hello"' }];
    const graph = buildMermaidGraph(pages);
    expect(graph).toContain('&quot;hello&quot;');
    expect(graph).not.toContain('"hello"');
  });
});
