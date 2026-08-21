/**
 * Roster summary for the User Management page.
 *
 * Three numbers the admin can act on. "Selected" used to live here too, but it
 * read 0 for most of a session and the bulk bar already states the count.
 */

import React from 'react';
import { Users, UserCheck, Shield } from 'lucide-react';
import { StatCard } from '@myk9/ui';
import type { User } from '@/types/user-types';
import { calculateRoleStats, countActiveUsers } from './UserManagementPage.helpers';

interface UserManagementStatsProps {
  filteredUsers: User[];
}

/**
 * On phones the three cards sit side by side in one compact strip (icons and
 * subtitles hidden) instead of stacking — stacked full-height cards pushed the
 * roster, the page's actual object of work, ~1.5 viewports below the fold.
 */
const COMPACT_ON_MOBILE = [
  'p-3 sm:p-5',
  'max-sm:[&_[data-slot=icon]]:hidden',
  'max-sm:[&_p]:hidden',
].join(' ');

export const UserManagementStats: React.FC<UserManagementStatsProps> = ({ filteredUsers }) => {
  const activeCount = countActiveUsers(filteredUsers);
  const suspendedCount = filteredUsers.length - activeCount;
  const roleStats = calculateRoleStats(filteredUsers);
  const totalRoles = Object.values(roleStats).reduce((sum, count) => sum + count, 0);
  const roleTypeCount = Object.keys(roleStats).length;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <StatCard
        title="Users in view"
        value={filteredUsers.length.toLocaleString()}
        icon={Users}
        color="primary"
        subtitle="Current roster"
        className={COMPACT_ON_MOBILE}
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
        className={COMPACT_ON_MOBILE}
      />
      <StatCard
        title="Roles in view"
        value={totalRoles}
        icon={Shield}
        color="purple"
        subtitle={`Across ${roleTypeCount} role type${roleTypeCount === 1 ? '' : 's'}`}
        className={COMPACT_ON_MOBILE}
      />
    </div>
  );
};
