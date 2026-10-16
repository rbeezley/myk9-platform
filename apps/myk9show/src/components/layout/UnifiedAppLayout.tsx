/**
 * UnifiedAppLayout — root layout with adaptive sidebar navigation.
 *
 * Replaces the per-role layout wrappers (JudgeLayout, ExhibitorLayout,
 * SecretaryLayout, AdminLayout) with a single layout that adapts its
 * sidebar sections based on the user's roles.
 *
 * Scoring routes render OUTSIDE this layout (full-screen, no sidebar).
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { RoleSidebar } from '@/components/layout/sidebar';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';
import { useRegisterAppShellMobileNav } from './useAppShellMobileNav';
import { buildUnifiedSidebarConfig } from './sidebar/unifiedSidebarConfig';
import { useRememberBrowseList } from './sidebar/useRememberBrowseList';
import type { ClubContext } from './sidebar/unifiedSidebarConfig';
import { useCurrentValidatedClubContext } from '@/hooks/useValidatedClubContext';

// Desktop shows the labeled icon rail; below `md` the same config opens as the
// full-width drawer (docs/plan-sidebar-browse-pane.md, phase 1).
const RAIL_WIDTH_PX = 88;
const DRAWER_WIDTH_PX = 240;

export const UnifiedAppLayout: React.FC = () => {
  const { user, getUserRoles, firstName } = useAuthContext();
  const roles = getUserRoles();
  const ensureClubsReady = useClubStore(s => s.ensureClubsReady);
  const validatedClubContext = useCurrentValidatedClubContext();

  useEffect(() => {
    void ensureClubsReady();
  }, [ensureClubsReady]);

  const clubContext = useMemo<ClubContext | undefined>(() => {
    if (validatedClubContext.status !== 'ready') return undefined;
    return {
      clubId: validatedClubContext.clubId,
      clubName: validatedClubContext.clubName,
    };
  }, [validatedClubContext]);
  const sidebarConfig = useMemo(
    () => buildUnifiedSidebarConfig(roles, clubContext, firstName),
    [roles, clubContext, firstName]
  );
  useRememberBrowseList(sidebarConfig);
  const { mobileOpen, setMobileOpen } = useSidebarLayoutState();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const openMobileNav = useCallback(() => setMobileOpen(true), [setMobileOpen]);
  useRegisterAppShellMobileNav(openMobileNav, mobileOpen);

  // Guest users see content without sidebar
  if (!user) {
    return <Outlet />;
  }

  return (
    <SidebarLayout
      sidebar={<RoleSidebar config={sidebarConfig} variant={isDesktop ? 'rail' : 'drawer'} />}
      sidebarWidth={isDesktop ? RAIL_WIDTH_PX : DRAWER_WIDTH_PX}
      mobileMenuLabel="Navigation"
      showMobileMenuButton={false}
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <Outlet />
    </SidebarLayout>
  );
};

export default UnifiedAppLayout;
