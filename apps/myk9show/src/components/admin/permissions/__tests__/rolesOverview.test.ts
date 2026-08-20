import { describe, it, expect } from 'vitest';
import type { Role, AuditLogEntry } from '@/types/rbac-types';
import {
  buildLastChangedMap,
  filterRoles,
  getRoleTypeLabel,
  getRoleDisplayName,
} from '../rolesOverview';

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'r1',
    name: 'show_secretary',
    description: 'Runs entries, classes, and results',
    is_system: true,
    permissions: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'a1',
    action: 'update_role',
    user_id: 'u1',
    target_id: 'r1',
    target_type: 'role',
    old_value: null,
    new_value: null,
    ip_address: null,
    user_agent: null,
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

describe('buildLastChangedMap', () => {
  it('maps a role id to its newest audit entry timestamp', () => {
    const map = buildLastChangedMap([
      makeEntry({ id: 'a1', created_at: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 'a2', created_at: '2026-08-05T10:00:00Z' }),
    ]);
    expect(map.get('r1')).toBe('2026-08-05T10:00:00Z');
  });

  it('keeps the newest even when entries arrive oldest-first', () => {
    const map = buildLastChangedMap([
      makeEntry({ id: 'a1', created_at: '2026-08-05T10:00:00Z' }),
      makeEntry({ id: 'a2', created_at: '2026-08-01T10:00:00Z' }),
    ]);
    expect(map.get('r1')).toBe('2026-08-05T10:00:00Z');
  });

  it('ignores entries that are not about a role', () => {
    const map = buildLastChangedMap([makeEntry({ target_type: 'user_role' })]);
    expect(map.size).toBe(0);
  });

  it('ignores entries with no target or no timestamp', () => {
    const map = buildLastChangedMap([
      makeEntry({ target_id: null }),
      makeEntry({ id: 'a2', created_at: null }),
    ]);
    expect(map.size).toBe(0);
  });

  it('returns an empty map for no entries', () => {
    expect(buildLastChangedMap([]).size).toBe(0);
  });
});

describe('filterRoles', () => {
  const roles = [
    makeRole({ id: 'r1', name: 'show_secretary', display_name: 'Show Secretary' }),
    makeRole({ id: 'r2', name: 'judge', display_name: 'Judge', description: 'Scores classes' }),
  ];

  it('returns every role for an empty term', () => {
    expect(filterRoles(roles, '')).toHaveLength(2);
  });

  it('returns every role for a whitespace-only term', () => {
    expect(filterRoles(roles, '   ')).toHaveLength(2);
  });

  it('matches on display name, case-insensitively', () => {
    expect(filterRoles(roles, 'JUDGE').map(r => r.id)).toEqual(['r2']);
  });

  it('matches on the raw name', () => {
    expect(filterRoles(roles, 'show_sec').map(r => r.id)).toEqual(['r1']);
  });

  it('matches on description', () => {
    expect(filterRoles(roles, 'scores').map(r => r.id)).toEqual(['r2']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterRoles(roles, 'zzz')).toEqual([]);
  });
});

describe('getRoleTypeLabel', () => {
  it('labels a system role System', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: true }))).toBe('System');
  });

  it('labels a non-system role Custom', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: false }))).toBe('Custom');
  });

  it('treats a null is_system as Custom', () => {
    expect(getRoleTypeLabel(makeRole({ is_system: null }))).toBe('Custom');
  });
});

describe('getRoleDisplayName', () => {
  it('prefers display_name', () => {
    expect(getRoleDisplayName(makeRole({ display_name: 'Show Secretary' }))).toBe('Show Secretary');
  });

  it('humanizes the raw name when display_name is absent', () => {
    expect(getRoleDisplayName(makeRole({ name: 'club_admin' }))).toBe('Club Admin');
  });
});
