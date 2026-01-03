import React from 'react';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';

/**
 * Component that redirects authenticated users to role-appropriate landing pages
 */
const RoleBasedLanding: React.FC = () => {
  // Use the role redirect hook for consistent redirect logic
  useRoleRedirect({ 
    enabled: true, 
    redirectOnRoleChange: false 
  });

  // This component handles redirects via the hook, so just show loading
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );
};

export default RoleBasedLanding;