/**
 * Statistics cards for the User Management page.
 */

import React from 'react';
import { Users, UserCheck, Shield, CheckSquare } from 'lucide-react';
import type { User } from '@/types/user-types';
import type { SelectedUser } from './UserManagementPage.types';

/** Shared style constants */
const SF_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';
const EASE_TIMING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  iconBgClass: string;
  hoverTextClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  iconBgClass,
  hoverTextClass,
}) => (
  <div
    className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl
                transition-all duration-300
                min-h-[140px]"
    style={{
      fontFamily: SF_FONT_FAMILY,
      transitionTimingFunction: EASE_TIMING,
    }}
  >
    <div
      className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                     opacity-0 transition-opacity duration-300"
    />
    <div className="relative h-full flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
            style={{ fontWeight: 590, letterSpacing: '0.02em' }}
          >
            {label}
          </p>
        </div>
        <div className={`p-2.5 ${iconBgClass} rounded-xl shadow-sm transition-all duration-300`}>
          {icon}
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <p
          className={`text-2xl font-bold mb-1 transition-colors duration-300 ${hoverTextClass ?? ''}`}
          style={{ fontWeight: 650, lineHeight: '1.25' }}
        >
          {value}
        </p>
        <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
          {subtitle}
        </p>
      </div>
    </div>
  </div>
);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Users"
          value={users.length.toLocaleString()}
          subtitle={
            filteredUsers.length !== users.length
              ? `${filteredUsers.length} filtered`
              : 'Platform users'
          }
          icon={<Users className="h-5 w-5 text-primary" />}
          iconBgClass="bg-gradient-to-br from-primary/20 to-primary/10"
        />
        <StatCard
          label="Active Users"
          value={activeCount}
          subtitle={`${activePercent}% of total`}
          icon={<UserCheck className="h-5 w-5 text-emerald-600" />}
          iconBgClass="bg-gradient-to-br from-emerald-500/20 to-emerald-500/10"
        />
        <StatCard
          label="Roles Assigned"
          value={totalRoles}
          subtitle={`Across ${roleTypeCount} role types`}
          icon={<Shield className="h-5 w-5 text-purple-600" />}
          iconBgClass="bg-gradient-to-br from-purple-500/20 to-purple-500/10"
          hoverTextClass="group-hover:text-purple-600"
        />
        <StatCard
          label="Selected"
          value={selectedUsers.length}
          subtitle={
            selectedUsers.length > 0 ? 'Users selected for bulk actions' : 'No users selected'
          }
          icon={<CheckSquare className="h-5 w-5 text-blue-600" />}
          iconBgClass="bg-gradient-to-br from-blue-500/20 to-blue-500/10"
          hoverTextClass="group-hover:text-blue-600"
        />
      </div>
    </div>
  );
};
