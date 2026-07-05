import React from 'react';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';
import { DashboardSkeleton } from '@/components/common/SkeletonLoaders';

/**
 * Component that redirects authenticated users to role-appropriate landing pages
 */
const RoleBasedLanding: React.FC = () => {
  // Use the role redirect hook for consistent redirect logic
  useRoleRedirect({
    enabled: true,
    redirectOnRoleChange: false,
  });

  // This component handles redirects via the hook, so just show loading
  return (
    <div role="status" aria-label="Loading dashboard route">
      <DashboardSkeleton />
    </div>
  );
};

export default RoleBasedLanding;
