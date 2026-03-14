import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import { filterUsers } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER } from './UserManagementPage.types';

describe('filterUsers status filter', () => {
  const users = [
    {
      id: '1',
      status: 'active',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
    },
    {
      id: '2',
      status: 'suspended',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    },
    {
      id: '3',
      status: 'active',
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol@example.com',
    },
  ] as User[];

  it('shows all users when status is "all"', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'all' });
    expect(result).toHaveLength(3);
  });

  it('filters to active only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'active' });
    expect(result).toHaveLength(2);
    expect(result.every(u => u.status === 'active')).toBe(true);
  });

  it('filters to suspended only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'suspended' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('combines search with status filter', () => {
    const result = filterUsers(users, 'alice', { ...DEFAULT_USER_FILTER, status: 'active' });
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Alice');
  });

  it('preserves generic type (AdminUser compatibility)', () => {
    interface AdminUser extends User {
      lastSignInAt: string | null;
    }
    const adminUsers: AdminUser[] = users.map(u => ({ ...u, lastSignInAt: '2026-01-01' }));
    const result = filterUsers(adminUsers, '', DEFAULT_USER_FILTER);
    expect(result[0].lastSignInAt).toBe('2026-01-01');
  });
});
