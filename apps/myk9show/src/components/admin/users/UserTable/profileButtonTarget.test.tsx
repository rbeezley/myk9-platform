import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { UserTable } from './index';

const USER = {
  id: 'people-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  roles: ['exhibitor'],
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastSignInAt: null,
} as unknown as AdminUser;

describe('UserTable profile button (MYK9-1535)', () => {
  it('takes the 44px target floor', () => {
    render(
      <UserTable
        users={[USER]}
        isLoading={false}
        selectedUsers={[]}
        onSelectUser={vi.fn()}
        onSelectAll={vi.fn()}
        onViewUser={vi.fn()}
        onEditUser={vi.fn()}
        currentPage={1}
        totalPages={1}
        totalFilteredUsers={1}
        onPageChange={vi.fn()}
        pageSize={25}
      />
    );
    expect(screen.getByRole('button', { name: 'Open profile for Jane Doe' })).toHaveClass(
      'min-h-11'
    );
  });
});
