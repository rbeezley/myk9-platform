import { describe, expect, it } from 'vitest';
import { buildRecordBreadcrumb, readRecordBackTo } from './recordBackTo';

const adminOrigin = {
  backTo: {
    href: '/admin/users?q=ada&role=judge',
    label: 'Users',
    parent: { label: 'Admin', href: '/admin' },
  },
};

const people = { label: 'People', href: '/people' };

describe('readRecordBackTo', () => {
  it('reads a full origin', () => {
    expect(readRecordBackTo(adminOrigin)).toEqual(adminOrigin.backTo);
  });

  it('reads an origin without a parent', () => {
    expect(readRecordBackTo({ backTo: { href: '/people', label: 'People' } })).toEqual({
      href: '/people',
      label: 'People',
    });
  });

  it('drops a malformed parent but keeps the origin', () => {
    const state = { backTo: { href: '/admin/users', label: 'Users', parent: { label: 'Admin' } } };
    expect(readRecordBackTo(state)).toEqual({ href: '/admin/users', label: 'Users' });
  });

  describe('rejects anything it cannot trust', () => {
    it.each([
      ['no state', null],
      ['no backTo', {}],
      ['a string state', 'admin'],
      ['a missing href', { backTo: { label: 'Users' } }],
      ['a blank label', { backTo: { href: '/admin/users', label: '   ' } }],
      ['an off-site href', { backTo: { href: 'https://evil.example/admin', label: 'Users' } }],
      ['a protocol-relative href', { backTo: { href: '//evil.example', label: 'Users' } }],
      ['a relative href', { backTo: { href: 'admin/users', label: 'Users' } }],
    ])('%s', (_name, state) => {
      expect(readRecordBackTo(state)).toBeNull();
    });
  });
});

describe('buildRecordBreadcrumb', () => {
  it('falls back to the canonical parent with no origin', () => {
    expect(buildRecordBreadcrumb(null, people, 'Ada Lovelace')).toEqual([
      people,
      { label: 'Ada Lovelace', isCurrentPage: true },
    ]);
  });

  it('names the admin trail when entered from the roster', () => {
    expect(buildRecordBreadcrumb(readRecordBackTo(adminOrigin), people, 'Ada Lovelace')).toEqual([
      { label: 'Admin', href: '/admin' },
      { label: 'Users', href: '/admin/users?q=ada&role=judge' },
      { label: 'Ada Lovelace', isCurrentPage: true },
    ]);
  });

  it('links back to the exact list, filters included', () => {
    const trail = buildRecordBreadcrumb(readRecordBackTo(adminOrigin), people, 'Ada Lovelace');
    expect(trail[1]?.href).toContain('q=ada');
    expect(trail[1]?.href).toContain('role=judge');
  });

  it('never renders the canonical parent alongside an origin', () => {
    // Two "up" links, one of them wrong, is worse than the wrong one alone.
    const trail = buildRecordBreadcrumb(readRecordBackTo(adminOrigin), people, 'Ada Lovelace');
    expect(trail.map(item => item.label)).not.toContain('People');
  });
});
