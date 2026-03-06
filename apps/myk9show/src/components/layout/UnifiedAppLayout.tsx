/**
 * UnifiedAppLayout — root layout with adaptive sidebar navigation.
 *
 * Replaces the per-role layout wrappers (JudgeLayout, ExhibitorLayout,
 * SecretaryLayout, AdminLayout) with a single layout that adapts its
 * sidebar sections based on the user's roles.
 *
 * Scoring routes render OUTSIDE this layout (full-screen, no sidebar).
 */

import React, { useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { RoleSidebar } from '@/components/layout/sidebar';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { useAuthContext } from '@/hooks/useAuthContext';
import { buildUnifiedSidebarConfig } from './sidebar/unifiedSidebarConfig';

export const UnifiedAppLayout: React.FC = () => {
  const { getUserRoles } = useAuthContext();
  const roles = getUserRoles();
  const sidebarConfig = useMemo(() => buildUnifiedSidebarConfig(roles), [roles]);
  const { mobileOpen, setMobileOpen } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<RoleSidebar config={sidebarConfig} />}
      sidebarWidth={240}
      collapsedWidth={56}
      isCollapsible
      isCollapsed
      hoverToExpand
      mobileMenuLabel="Navigation"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <Outlet />
    </SidebarLayout>
  );
};

export default UnifiedAppLayout;
