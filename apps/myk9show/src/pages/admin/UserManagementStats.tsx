/**
 * Statistics cards for the User Management page.
 */

import React from 'react';
import { Users, UserCheck, Shield, CheckSquare } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { User } from '@/types/user-types';
import type { SelectedUser } from './UserManagementPage.types';

const SF_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

interface UserManagementStatsProps {
  users: User[];
  filteredUsers: User[];
  roleStats: Record<string, number>;
  selectedUsers: SelectedUser[];
}

export const UserManagementStats: React.FC<UserManagementStatsProps> = ({
  users,
  filteredUsers,
  roleStats,
  selectedUsers,
}) => {
  const activeCount = users.filter(u => u.email && u.firstName).length;
  const activePercent = ((activeCount / (users.length || 1)) * 100).toFixed(1);
  const totalRoles = Object.values(roleStats).reduce((sum, count) => sum + count, 0);
  const roleTypeCount = Object.keys(roleStats).length;

  return (
    <div className="mb-16">
      <div className="flex items-center gap-4 mb-8" style={{ fontFamily: SF_FONT_FAMILY }}>
        <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
            User Statistics
          </h2>
          <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
            Current user metrics and role distribution
          </p>
        </div>
      </div>
      <StatsGrid columns={4}>
        <StatCard
          title="Total Users"
          value={users.length.toLocaleString()}
          icon={Users}
          color="primary"
          subtitle={
            filteredUsers.length !== users.length
              ? `${filteredUsers.length} filtered`
              : 'Platform users'
          }
        />
        <StatCard
          title="Active Users"
          value={activeCount}
          icon={UserCheck}
          color="emerald"
          subtitle={`${activePercent}% of total`}
        />
        <StatCard
          title="Roles Assigned"
          value={totalRoles}
          icon={Shield}
          color="purple"
          subtitle={`Across ${roleTypeCount} role types`}
        />
        <StatCard
          title="Selected"
          value={selectedUsers.length}
          icon={CheckSquare}
          color="blue"
          subtitle={
            selectedUsers.length > 0 ? 'Users selected for bulk actions' : 'No users selected'
          }
        />
      </StatsGrid>
    </div>
  );
};
