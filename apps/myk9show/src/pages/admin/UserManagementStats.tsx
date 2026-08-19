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
import { calculateRoleStats, countActiveUsers } from './UserManagementPage.helpers';

interface UserManagementStatsProps {
  filteredUsers: User[];
}

export const UserManagementStats: React.FC<UserManagementStatsProps> = ({ filteredUsers }) => {
  const activeCount = countActiveUsers(filteredUsers);
  const suspendedCount = filteredUsers.length - activeCount;
  const roleStats = calculateRoleStats(filteredUsers);
  const totalRoles = Object.values(roleStats).reduce((sum, count) => sum + count, 0);
  const roleTypeCount = Object.keys(roleStats).length;

  return (
    <StatsGrid columns={3}>
      <StatCard
        title="Users in view"
        value={filteredUsers.length.toLocaleString()}
        icon={Users}
        color="primary"
        subtitle="Current roster"
      />
      <StatCard
        title="Active in view"
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
        title="Roles in view"
        value={totalRoles}
        icon={Shield}
        color="purple"
        subtitle={`Across ${roleTypeCount} role type${roleTypeCount === 1 ? '' : 's'}`}
      />
    </StatsGrid>
  );
};
