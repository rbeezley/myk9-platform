import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UserManagementStats } from './UserManagementStats';
import type { User } from '@/types/user-types';

const users = [
  { id: 'active', firstName: 'Ada', lastName: 'Lovelace', status: 'active', roles: ['exhibitor'] },
  {
    id: 'suspended',
    firstName: 'Grace',
    lastName: 'Hopper',
    status: 'suspended',
    roles: ['judge', 'secretary'],
  },
] as unknown as User[];

describe('UserManagementStats', () => {
  it('keeps every metric scoped to the current roster view', () => {
    render(<UserManagementStats filteredUsers={users} />);

    expect(screen.getByText('Users in view')).toBeInTheDocument();
    expect(screen.getByText('Active in view')).toBeInTheDocument();
    expect(screen.getByText('Roles in view')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1 suspended or removed')).toBeInTheDocument();
  });
});
