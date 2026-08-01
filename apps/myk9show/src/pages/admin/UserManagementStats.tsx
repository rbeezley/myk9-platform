/**
 * Roster summary for the User Management page.
 *
 * Three numbers the admin can act on. "Selected" used to live here too, but it
 * read 0 for most of a session and the bulk bar already states the count.
 */

import React from 'react';
import { Users, UserCheck, Shield } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { User } from '@/types/user-types';
import { countActiveUsers } from './UserManagementPage.helpers';

interface UserManagementStatsProps {
  users: User[];
  filteredUsers: User[];
  roleStats: Record<string, number>;
}

export const UserManagementStats: React.FC<UserManagementStatsProps> = ({
  users,
  filteredUsers,
  roleStats,
}) => {
  const activeCount = countActiveUsers(users);
  const suspendedCount = users.length - activeCount;
  const totalRoles = Object.values(roleStats).reduce((sum, count) => sum + count, 0);
  const roleTypeCount = Object.keys(roleStats).length;

  return (
    <StatsGrid columns={3}>
      <StatCard
        title="Total Users"
        value={users.length.toLocaleString()}
        icon={Users}
        color="primary"
        subtitle={
          filteredUsers.length !== users.length ? `${filteredUsers.length} shown` : 'On the platform'
        }
      />
      <StatCard
        title="Active Accounts"
        value={activeCount}
        icon={UserCheck}
        color="emerald"
        subtitle={
          suspendedCount > 0
            ? `${suspendedCount} suspended or removed`
            : 'None suspended or removed'
        }
      />
      <StatCard
        title="Roles Assigned"
        value={totalRoles}
        icon={Shield}
        color="purple"
        subtitle={`Across ${roleTypeCount} role type${roleTypeCount === 1 ? '' : 's'}`}
      />
    </StatsGrid>
  );
};
