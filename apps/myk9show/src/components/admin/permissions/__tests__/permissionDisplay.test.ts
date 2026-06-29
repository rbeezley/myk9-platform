import { describe, it, expect } from 'vitest';
import type { Permission } from '@/types/rbac-types';
import {
  getPermissionResource,
  getPermissionAction,
  getPermissionDisplayName,
} from '../permissionDisplay';

function makePermission(overrides: Partial<Permission>): Permission {
  return {
    id: 'id',
    code: 'show:manage',
    name: 'Manage Shows',
    description: null,
    category: null,
    created_at: null,
    ...overrides,
  };
}

describe('permissionDisplay helpers', () => {
  it('derives resource from the code when no explicit field', () => {
    expect(getPermissionResource(makePermission({ code: 'entry:create' }))).toBe('entry');
  });

  it('prefers the explicit resource field over the code', () => {
    expect(
      getPermissionResource(makePermission({ code: 'entry:create', resource: 'custom' }))
    ).toBe('custom');
  });

  it('falls back to "other" when code has no resource segment', () => {
    expect(getPermissionResource(makePermission({ code: '' }))).toBe('other');
  });

  it('derives action from the code when no explicit field', () => {
    expect(getPermissionAction(makePermission({ code: 'entry:create' }))).toBe('create');
  });

  it('prefers display_name over name', () => {
    expect(
      getPermissionDisplayName(makePermission({ name: 'raw', display_name: 'Pretty' }))
    ).toBe('Pretty');
  });

  it('falls back to name when display_name is absent', () => {
    expect(getPermissionDisplayName(makePermission({ name: 'raw' }))).toBe('raw');
  });
});
